import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { normalizeName, normalizeSimple, parseDateFlexible } from "../lib/format";

export const employeesRouter = Router();

const EmployeeCreateSchema = z.object({
  name: z.string().min(1),
  matricula: z.string().min(1),
  costCenter: z.string().min(1),
  branch: z.string().min(1),
  admissionDate: z.string().min(1), // YYYY-MM-DD ou YYYYMMDD
  terminationDate: z.string().optional().nullable(), // YYYY-MM-DD ou YYYYMMDD ou null
});

const EmployeeUpdateSchema = EmployeeCreateSchema.partial().extend({
  admissionDate: z.string().optional(),
  terminationDate: z.string().optional().nullable(),
});

// GET /employees?status=active|inactive|all&search=&branch=&costCenter=&page=&pageSize=
employeesRouter.get("/", async (req, res) => {
  const status = String(req.query.status ?? "active");
  const searchRaw = String(req.query.search ?? "").trim();
  const branch = String(req.query.branch ?? "").trim();
  const costCenter = String(req.query.costCenter ?? "").trim();
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 20) || 20));

  const where: any = {};

  if (status === "active") where.terminationDate = null;
  else if (status === "inactive") where.terminationDate = { not: null };

  if (branch) where.branch = branch;
  if (costCenter) where.costCenter = costCenter;

  if (searchRaw) {
    // MySQL: Prisma NÃO aceita `mode: "insensitive"`.
    // Case-insensitive depende da collation do banco (geralmente já é _ci).
    const search = searchRaw;

    where.OR = [
      { name: { contains: search } },
      { matricula: { contains: search } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ items, total, page, pageSize });
});

// GET /employees/:id
employeesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "id inválido" });

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });

  res.json(employee);
});

// POST /employees
employeesRouter.post("/", async (req, res) => {
  const parsed = EmployeeCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });

  const b = parsed.data;

  const admissionDate = parseDateFlexible(b.admissionDate);
  const terminationDate = b.terminationDate ? parseDateFlexible(b.terminationDate) : null;

  if (terminationDate && terminationDate < admissionDate) {
    return res.status(400).json({ message: "Demissão não pode ser antes da admissão" });
  }

  try {
    const created = await prisma.employee.create({
      data: {
        name: normalizeName(b.name),
        matricula: normalizeSimple(b.matricula),
        costCenter: normalizeSimple(b.costCenter),
        branch: normalizeSimple(b.branch),
        admissionDate,
        terminationDate,
      },
    });
    res.status(201).json(created);
  } catch (err: any) {
    // matrícula duplicada
    if (String(err?.code) === "P2002") {
      return res.status(409).json({ message: "Matrícula já existe" });
    }
    throw err;
  }
});

// PUT /employees/:id
employeesRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "id inválido" });

  const parsed = EmployeeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });

  const b = parsed.data;

  const current = await prisma.employee.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ message: "Funcionário não encontrado" });

  const admissionDate = b.admissionDate ? parseDateFlexible(b.admissionDate) : current.admissionDate;
  const terminationDate =
    b.terminationDate === undefined
      ? current.terminationDate
      : b.terminationDate
        ? parseDateFlexible(b.terminationDate)
        : null;

  if (terminationDate && terminationDate < admissionDate) {
    return res.status(400).json({ message: "Demissão não pode ser antes da admissão" });
  }

  // não deixamos editar matrícula para evitar bagunça; se precisar, criamos endpoint próprio
  if (b.matricula) {
    return res.status(400).json({ message: "Matrícula não pode ser alterada por este endpoint" });
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      name: b.name ? normalizeName(b.name) : undefined,
      costCenter: b.costCenter ? normalizeSimple(b.costCenter) : undefined,
      branch: b.branch ? normalizeSimple(b.branch) : undefined,
      admissionDate: b.admissionDate ? admissionDate : undefined,
      terminationDate: b.terminationDate !== undefined ? terminationDate : undefined,
    },
  });

  res.json(updated);
});

// PATCH /employees/:id/terminate  { terminationDate: "YYYY-MM-DD" }
employeesRouter.patch("/:id/terminate", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "id inválido" });

  const schema = z.object({ terminationDate: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Dados inválidos", issues: parsed.error.issues });

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });

  const terminationDate = parseDateFlexible(parsed.data.terminationDate);

  if (terminationDate < employee.admissionDate) {
    return res.status(400).json({ message: "Demissão não pode ser antes da admissão" });
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: { terminationDate },
  });

  res.json(updated);
});

// PATCH /employees/:id/reactivate  -> limpa demissão
employeesRouter.patch("/:id/reactivate", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "id inválido" });

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) return res.status(404).json({ message: "Funcionário não encontrado" });

  const updated = await prisma.employee.update({
    where: { id },
    data: { terminationDate: null },
  });

  res.json(updated);
});

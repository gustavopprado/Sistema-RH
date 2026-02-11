import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { normalizeName, normalizeSimple, parseDateFlexible } from "../src/lib/format";

type RawEmployee = {
  "Nome": string;
  "Matricula": string;
  "Centro Custo": string;
  "Admissao": string;   // YYYYMMDD
  "Demissao": string;   // "" ou YYYYMMDD
  "Filial": string;
};

async function main() {
  const jsonPath = process.env.SEED_JSON_PATH || "./data/funcionarios.json";
  const abs = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);

  const raw = fs.readFileSync(abs, "utf-8");
  const items = JSON.parse(raw) as RawEmployee[];

  let created = 0;
  let updated = 0;

  for (const r of items) {
    const admissionDate = parseDateFlexible(r["Admissao"]);
    const terminationDate = r["Demissao"] ? parseDateFlexible(r["Demissao"]) : null;

    const data = {
      name: normalizeName(r["Nome"]),
      matricula: normalizeSimple(r["Matricula"]),
      costCenter: normalizeSimple(r["Centro Custo"]),
      branch: normalizeSimple(r["Filial"]),
      admissionDate,
      terminationDate
    };

    const existing = await prisma.employee.findUnique({ where: { matricula: data.matricula } });

    if (!existing) {
      await prisma.employee.create({ data });
      created++;
    } else {
      // Atualiza apenas dados "mestres" (sem mexer na matrícula)
      await prisma.employee.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          costCenter: data.costCenter,
          branch: data.branch,
          admissionDate: data.admissionDate,
          terminationDate: data.terminationDate
        }
      });
      updated++;
    }
  }

  console.log({ created, updated, total: items.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
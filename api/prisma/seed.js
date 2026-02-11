"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const prisma_1 = require("../src/lib/prisma");
const format_1 = require("../src/lib/format");
async function main() {
    const jsonPath = process.env.SEED_JSON_PATH || "./data/funcionarios.json";
    const abs = node_path_1.default.isAbsolute(jsonPath) ? jsonPath : node_path_1.default.join(process.cwd(), jsonPath);
    const raw = node_fs_1.default.readFileSync(abs, "utf-8");
    const items = JSON.parse(raw);
    let created = 0;
    let updated = 0;
    for (const r of items) {
        const admissionDate = (0, format_1.parseDateFlexible)(r["Admissao"]);
        const terminationDate = r["Demissao"] ? (0, format_1.parseDateFlexible)(r["Demissao"]) : null;
        const data = {
            name: (0, format_1.normalizeName)(r["Nome"]),
            matricula: (0, format_1.normalizeSimple)(r["Matricula"]),
            costCenter: (0, format_1.normalizeSimple)(r["Centro Custo"]),
            branch: (0, format_1.normalizeSimple)(r["Filial"]),
            admissionDate,
            terminationDate
        };
        const existing = await prisma_1.prisma.employee.findUnique({ where: { matricula: data.matricula } });
        if (!existing) {
            await prisma_1.prisma.employee.create({ data });
            created++;
        }
        else {
            // Atualiza apenas dados "mestres" (sem mexer na matrícula)
            await prisma_1.prisma.employee.update({
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
    await prisma_1.prisma.$disconnect();
});

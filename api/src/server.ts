import "dotenv/config";
import express from "express";
import cors from "cors";
import { employeesRouter } from "./routes/employees";

const app = express();

app.use(express.json());

// CORS para dev. Em produção você restringe pelo domínio.
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",").map(s => s.trim()) ?? "*"
}));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/employees", employeesRouter);

const port = Number(process.env.PORT ?? 3333);
app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
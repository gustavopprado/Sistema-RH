import "dotenv/config";
import express from "express";
import cors from "cors";
import { employeesRouter } from "./routes/employees";
import { voucherMarketRouter } from "./routes/voucherMarket";

const app = express();

app.use(express.json());

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(",").map(s => s.trim()) ?? "*"
}));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/employees", employeesRouter);

// Vale Mercado
app.use("/voucher-market", voucherMarketRouter);

const port = Number(process.env.PORT ?? 3333);
app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});

import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? "3001");
const host = process.env.HOST ?? "127.0.0.1";
const dbPath = process.env.OFFERMESH_DB_PATH;

const app = await createApp({ dbPath });
app.listen(port, host, () => {
  console.log(`OfferMesh backend listening at http://${host}:${port}`);
});

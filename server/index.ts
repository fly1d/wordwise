import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 8787);
const app = createApp();

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Translation API ready at http://127.0.0.1:${PORT}`);
});

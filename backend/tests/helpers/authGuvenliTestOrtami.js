import net from "node:net";

process.env.RUN_LIVE_GEMINI_TESTS = "false";
process.env.GEMINI_API_KEY = "yalniz-mock-test";
process.env.MONGODB_URI = "mongodb://127.0.0.1/auth-mock-test";
process.env.EMAIL_USER = "mock@example.test";
process.env.EMAIL_PASS = "yalniz-mock-smtp";
net.Socket.prototype.connect = function () { throw new Error("Mock testte gerçek TCP/MongoDB/SMTP bağlantısı yasak."); };
globalThis.fetch = async () => { throw new Error("Mock testte gerçek API erişimi yasak."); };

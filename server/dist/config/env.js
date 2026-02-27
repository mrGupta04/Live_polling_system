"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.env = {
    port: Number(process.env.PORT || 4000),
    mongoUri: process.env.MONGO_URI ||
        process.env.MONGODB_URI ||
        "mongodb://127.0.0.1:27017/live_polling",
    clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173,http://localhost:5174")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
};

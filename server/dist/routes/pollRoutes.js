"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPollRoutes = createPollRoutes;
const express_1 = require("express");
function createPollRoutes(controller) {
    const router = (0, express_1.Router)();
    router.get("/state", controller.getState);
    router.get("/history", controller.getHistory);
    router.post("/create", controller.createPoll);
    return router;
}

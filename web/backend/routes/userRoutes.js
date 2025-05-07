import express from "express";
import { createUserIfNotExists } from "../controllers/userController.js";

const router = express.Router();

router.post("/create", createUserIfNotExists);

export default router;
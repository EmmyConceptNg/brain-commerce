import express from 'express'
import { validate } from '../controllers/validateController.js'

const router = express.Router()

router.post('/',validate)


export default router

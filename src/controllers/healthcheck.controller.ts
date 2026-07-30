import { Request, Response } from "express";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
/**
const healthcheck = async (req:any,res:any,next:any) => { 
    try {
        res.status(200).json(
            new ApiResponse(200, {message : 'Server is running'})
        )
    } catch (error) {
        next(error)
    }
}
*/

const healthcheck = asyncHandler(async (req: Request, res: Response)=> {
    res.status(200).json(
        new ApiResponse(200,{message:"Server is Running"})
    )
})

export {healthcheck}
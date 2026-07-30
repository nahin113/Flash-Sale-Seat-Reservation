import { Request, Response, NextFunction } from "express";

const asyncHandler = (requestHandler: (req: Request, res: Response, next: NextFunction) => any) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err: any) => next(err))
    }
}

export {asyncHandler}

// not need to write repeatative try catch . catch will handle all the errors and pass it on the express's inbuilt error
// Automatically all passing functions  will be promisified , so manually writing try catch not needed
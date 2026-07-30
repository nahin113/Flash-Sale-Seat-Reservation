class APIError extends Error {
    constructor(
        public statusCode:number, 
        public message : string = "Something went wrong",
        public errors:[], 
        public stack : string = "",
        public data = null,
        public success = false
    ) {
        super(message); 
        this.errors = errors
        this.statusCode = statusCode
        this.data = null
        this.success = false
        this.message = message
        this.errors = errors
        if(stack) {
            this.stack = stack
        }else {
            Error.captureStackTrace(this, this.constructor)
        }
    } 
}

export {APIError}
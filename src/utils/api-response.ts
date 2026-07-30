class ApiResponse {
    constructor(
        public statusCode: number, 
        public data: any, 
        public message:string = "Success",
        public success:boolean = statusCode < 400
    ) {
        this.statusCode = statusCode
        this.data = data
        this.message = message
        this.success = statusCode < 400
    }
}

export {ApiResponse}
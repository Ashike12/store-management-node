export class CommandResponse {
    IsSuccess: boolean;
    Data: any;
    ErrorMessage: string;
    ErrorMessageKey: string;

    constructor() {
        this.IsSuccess = true;
        this.Data = [];
    }

    setError() {
        this.IsSuccess = false;
    }

    setSuccess(data: any) {
        this.Data = data;
    }

}
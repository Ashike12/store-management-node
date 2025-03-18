export class QueryRespone {
    IsSuccess: boolean;
    Data: any;
    TotalCount: number;

    public constructor() {
        this.IsSuccess = true;
        this.TotalCount = 0;
        this.Data = []
    }

    setData(data: any, totalCount: number) {
        this.Data = data;
        this.TotalCount = totalCount;
    }
}
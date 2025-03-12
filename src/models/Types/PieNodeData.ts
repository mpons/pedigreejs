import {Sex} from "@/models/Types/Sex.ts";

export type PieNodeData = {
    cancer: 0|1,
    ncancers: number,
    id: string,
    sex: Sex,
    proband: boolean,
    hidden?: boolean,
    affected?: boolean,
    exclude?: boolean,
}
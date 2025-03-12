import {PolygenicRiskScoreValue} from "@/models/PolygenicRiskScoreValue.ts";

export interface PolygenicRiskScore {
    breast_cancer_prs?: PolygenicRiskScoreValue
    ovarian_cancer_prs?: PolygenicRiskScoreValue
    prostate_cancer_prs?: PolygenicRiskScoreValue
}
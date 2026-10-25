export const FORMULA_VERSION = 'mosquito-net-v1';
export const NET_HEIGHT_UNIT = 'feet';

export type MosquitoNetBuilderOptions = {
  leftWidth: number;
  rightWidth: number;
  leftLength: number;
  rightLength: number;
  mosquitoNetYardId: string;
  includeBelowCloth: boolean;
  belowClothId: string;
  includeTopperNet: boolean;
  topperNetYardId: string;
  topperDirection: 'width' | 'length';
  topHeight: number;
  belowHeight: number;
  kuchiStyle: '4side' | 'gap';
  kuchiCount: number;
  kuchiGap: number;
  fitaId: string;
  fitaStyle: string;
  sutarBobinId: string;
};

// Inputs are validated by the shared checkout/quote parser before calculation.
export function calculateMosquitoNet(
  builderOptions: MosquitoNetBuilderOptions,
  mainNetHeightFeet: number,
  prices: {
    yard: number;
    topper: number;
    cloth: number;
    fita: number;
    thread: number;
  },
) {
  const totalNet =
    builderOptions.leftWidth +
    builderOptions.rightWidth +
    builderOptions.leftLength +
    builderOptions.rightLength;
  const noOfKuchi =
    builderOptions.kuchiStyle === '4side'
      ? builderOptions.kuchiCount * 8
      : Math.floor(totalNet / Math.max(builderOptions.kuchiGap, 1)) + 1;
  const kuchiNet = noOfKuchi * 2;
  const totalBoundaryNet = totalNet + kuchiNet;
  const minimumSide = Math.min(
    builderOptions.leftWidth,
    builderOptions.rightWidth,
    builderOptions.leftLength,
    builderOptions.rightLength,
  );
  const mosquitoNetYardHeightInInch = mainNetHeightFeet * 12;
  const oppositeSideRun =
    builderOptions.topperDirection === 'width'
      ? Math.max(builderOptions.leftLength, builderOptions.rightLength)
      : Math.max(builderOptions.leftWidth, builderOptions.rightWidth);
  const topperNetInInch =
    Math.ceil(minimumSide / mosquitoNetYardHeightInInch) * oppositeSideRun;
  const topAndBelowHeight =
    builderOptions.topHeight * 2 + builderOptions.belowHeight;
  const belowClothInInch = builderOptions.includeBelowCloth
    ? totalBoundaryNet /
      Math.max(Math.floor(30 / Math.max(topAndBelowHeight, 1)), 1)
    : 0;
  const [widthCount, lengthCount] = builderOptions.fitaStyle
    .split(':')
    .map(Number);
  const fitaLengthInInch =
    totalNet +
    widthCount * Math.max(builderOptions.leftWidth, builderOptions.rightWidth) +
    lengthCount *
      Math.max(builderOptions.leftLength, builderOptions.rightLength);
  const totalFita = Math.max(Math.ceil(fitaLengthInInch / (12 * 36)), 1);
  const finalPrice =
    (totalBoundaryNet / 36) * prices.yard +
    (topperNetInInch / 36) * prices.topper +
    (belowClothInInch / 36) * prices.cloth +
    totalFita * prices.fita +
    prices.thread +
    200;

  return {
    breakdown: {
      TotalNetInch: totalNet,
      NoOfKuchi: noOfKuchi,
      KuchiNetInch: kuchiNet,
      BoundaryNetInch: totalBoundaryNet,
      TopperNetInch: topperNetInInch,
      BelowClothInch: belowClothInInch,
      FitaLengthInch: fitaLengthInInch,
      FitaRolls: totalFita,
      SutarBobinCount: 1,
      BoundaryCost: (totalBoundaryNet / 36) * prices.yard,
      TopperCost: (topperNetInInch / 36) * prices.topper,
      BelowClothCost: (belowClothInInch / 36) * prices.cloth,
      FitaCost: totalFita * prices.fita,
      SutarBobinCost: prices.thread,
      LabourCost: 200,
    },
    finalPrice,
    fitaLengthInInch,
    totalFita,
    topperNet: topperNetInInch,
    totalBoundaryNet,
  };
}

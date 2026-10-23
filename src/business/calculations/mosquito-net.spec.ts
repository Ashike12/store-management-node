import {
  calculateMosquitoNet,
  MosquitoNetBuilderOptions,
  FORMULA_VERSION,
} from './mosquito-net';

const base: MosquitoNetBuilderOptions = {
  leftWidth: 72,
  rightWidth: 72,
  leftLength: 84,
  rightLength: 84,
  mosquitoNetYardId: 'yard',
  includeBelowCloth: false,
  belowClothId: '',
  includeTopperNet: false,
  topperNetYardId: '',
  topperDirection: 'width',
  topHeight: 3,
  belowHeight: 8,
  kuchiStyle: '4side',
  kuchiCount: 4,
  kuchiGap: 12,
  fitaId: 'fita',
  fitaStyle: '2:1',
  sutarBobinId: 'thread',
};
const prices = { yard: 36, topper: 36, cloth: 36, fita: 50, thread: 20 };
describe('mosquito-net-v1 fixtures (all input dimensions in inches, net height in feet)', () => {
  it('uses 5 feet as 60 inches and charges two fita rolls for 540 inches', () => {
    const result = calculateMosquitoNet(base, 5, prices);
    expect(FORMULA_VERSION).toBe('mosquito-net-v1');
    expect(result.topperNet).toBe(168);
    expect(result.fitaLengthInInch).toBe(540);
    expect(result.totalFita).toBe(2);
    expect(result.finalPrice).toBe(864);
  });
  it('uses length operation opposite width and retains main height for alternate topper', () => {
    const result = calculateMosquitoNet(
      { ...base, topperDirection: 'length', includeTopperNet: true },
      5,
      { ...prices, topper: 72 },
    );
    expect(result.topperNet).toBe(144);
    expect(result.breakdown.TopperCost).toBe(288);
  });
  it('splits 30-inch cloth using floor and includes both trim heights', () => {
    const result = calculateMosquitoNet(
      { ...base, includeBelowCloth: true },
      5,
      prices,
    );
    expect(result.breakdown.BelowClothInch).toBe(188);
    expect(result.finalPrice).toBe(1052);
  });
  it('floors fractional gaps before adding one kuchi', () => {
    const result = calculateMosquitoNet(
      { ...base, kuchiStyle: 'gap', kuchiGap: 11 },
      5,
      prices,
    );
    expect(result.breakdown.NoOfKuchi).toBe(29);
    expect(result.breakdown.KuchiNetInch).toBe(58);
  });
  it.each([
    [432, 1],
    [433, 2],
    [864, 2],
  ])('fita length %s inches charges %s rolls', (length, rolls) => {
    // Equal sides and 1:1 fita: perimeter plus two cross-runs = six sides.
    const side = length / 6;
    const result = calculateMosquitoNet(
      {
        ...base,
        leftWidth: side,
        rightWidth: side,
        leftLength: side,
        rightLength: side,
        fitaStyle: '1:1',
      },
      5,
      prices,
    );
    expect(result.fitaLengthInInch).toBeCloseTo(length);
    expect(result.totalFita).toBe(rolls);
  });
});

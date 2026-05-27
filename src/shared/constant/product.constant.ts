export const PRODUCT_CATEGORY_SUBCATEGORY_MAP: Record<string, string[]> = {
  MosquitoNetYard: ['Bonafide', 'Shaha', 'ThreeStar', 'Other'],
  MosquitoNet: ['Single', 'Semi-Double', 'Double', 'Large', 'Window Net'],
  'Baby Item': ['Nouka', 'Vanga', 'Umbrella'],
  'Filter Net': ['CowNet', 'BuldingSafety', 'WholeItem', 'FieldMat'],
  'Fishing Net': ['Jhaki-Zal', 'Thela-Zal', 'WholeItem', 'Door-Zal'],
  'China Net': ['FoldingNetThreeVaj', 'FoldingNetFiveVaj', 'TabligNet'],
  Others: ['SutarBobin', 'Fita', 'MosquitoNetBelowCloth'],
};

export const PRODUCT_CATEGORIES = Object.keys(PRODUCT_CATEGORY_SUBCATEGORY_MAP);

export const RATING_FILLS: Record<string, string> = {
  '0': '00AEE5',
  '1': '02AE4F',
  '2': 'FFBD23',
  '3': 'FF7A00',
  '4': 'E34217',
  '5': 'BD1820',
};

export const ratingFill = (rating: string): string | undefined => RATING_FILLS[rating.trim()];

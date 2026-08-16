export type UnconfirmedShiftItem = {
  id: string;
  workplaceId: string;
  date: string;
  workplaceName: string;
  workplaceColor: string;
  comment: string | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  transportationAllowance: number;
};

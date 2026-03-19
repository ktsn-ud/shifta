export type UnconfirmedShiftItem = {
  id: string;
  date: string;
  workplaceName: string;
  workplaceColor: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

export type ConfirmedShiftItem = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  workDurationHours: number;
  wage: number | null;
};

export type ConfirmedShiftWorkplaceGroup = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  shifts: ConfirmedShiftItem[];
};

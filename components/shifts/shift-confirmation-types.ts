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
};

export type ConfirmedShiftItem = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  comment: string | null;
  workDurationHours: number | null;
  wage: number | null;
  status?: "provisional";
};

export type ConfirmedShiftWorkplaceGroup = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  shifts: ConfirmedShiftItem[];
};

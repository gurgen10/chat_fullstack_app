export type UserRow = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: number;
};

export type MessageRow = {
  id: string;
  threadId: string;
  senderId: string;
  text: string;
  imageDataUrl?: string;
  createdAt: number;
};

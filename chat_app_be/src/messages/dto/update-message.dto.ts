import { IsString } from 'class-validator';

export class UpdateMessageDto {
  /** New plain text, caption, or mixed caption; empty string allowed when an image remains. */
  @IsString()
  text!: string;
}

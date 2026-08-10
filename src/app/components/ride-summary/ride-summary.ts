import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { RideSummary as RideSummaryModel } from '../../core/ride/ride-summary';
import { DurationPipe } from '../../shared/duration.pipe';

export interface RideSummaryDialogData {
  readonly summary: RideSummaryModel;
  readonly routeName: string;
}

@Component({
  selector: 'app-ride-summary',
  imports: [DurationPipe, MatButtonModule, MatDialogModule],
  templateUrl: './ride-summary.html',
  styleUrl: './ride-summary.scss',
})
export class RideSummary {
  protected readonly data = inject<RideSummaryDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RideSummary>);

  protected close(): void {
    this.dialogRef.close();
  }
}

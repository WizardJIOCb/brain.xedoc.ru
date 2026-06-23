import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { IngestPredictionService } from './ingest-predictor.service';

@Module({
  controllers: [IngestController],
  providers: [IngestService, IngestPredictionService],
  exports: [IngestService, IngestPredictionService],
})
export class IngestModule {}

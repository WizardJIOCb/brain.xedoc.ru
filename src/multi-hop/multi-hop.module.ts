import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { SynthesizeModule } from '../synthesize/synthesize.module';
import { MultiHopController } from './multi-hop.controller';
import { MultiHopService } from './multi-hop.service';
import { MultiHopPlannerService } from './multi-hop-planner.service';

@Module({
  imports: [SearchModule, SynthesizeModule],
  controllers: [MultiHopController],
  providers: [MultiHopService, MultiHopPlannerService],
  exports: [MultiHopService],
})
export class MultiHopModule {}

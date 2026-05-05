import type { Scenario } from '../types';
import { rentScenarios } from './rent.scenarios';
import { estateScenarios } from './estate.scenarios';
import { eventsScenarios } from './events.scenarios';
import { healthScenarios } from './health.scenarios';
import { shopScenarios } from './shop.scenarios';
import { crossVerticalScenarios } from './cross-vertical.scenarios';

export const allScenarios: Scenario[] = [
  ...rentScenarios,
  ...estateScenarios,
  ...eventsScenarios,
  ...healthScenarios,
  ...shopScenarios,
  ...crossVerticalScenarios,
];

export {
  rentScenarios,
  estateScenarios,
  eventsScenarios,
  healthScenarios,
  shopScenarios,
  crossVerticalScenarios,
};

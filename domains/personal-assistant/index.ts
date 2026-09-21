export { SUBJECT, DEFAULT_SCOPE, type Predicate, ALL_PREDICATES, type ShippingAddress, type PredicateValueMap } from "./vocabulary.js";
export { humanAvowal, derivedInference } from "./provenance.js";
export { mustCapturedAt } from "./timestamps.js";
export { mintMemoryId } from "./ids.js";
export { type FactInput, type FactConstructionError, type FactConstructionResult, toMemory } from "./facts.js";
export {
  type StoreState,
  EMPTY_STORE,
  type RecordFactResult,
  type RecordFactOutcome,
  recordFact,
  type QueryOutcome,
  query,
  revokeSource,
  closeScope,
} from "./store.js";
export { type ScoredStatement, tokenize, cosineSimilarity, rankBySimilarity } from "./baseline.js";

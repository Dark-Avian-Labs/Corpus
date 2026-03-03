import {
  optionalPositiveInt,
  positiveInt,
  z,
  zodEnum,
} from '@corpus/core/validation';

import {
  ARTIFACT_CLASSES,
  ARTIFACT_GAUGE_MAX,
  ELEMENTS,
  HERO_CLASSES,
  HERO_RATINGS,
} from '../config.js';

const heroClass = zodEnum(HERO_CLASSES);
const artifactClass = zodEnum(ARTIFACT_CLASSES);
const element = zodEnum(ELEMENTS);
const heroRating = zodEnum(HERO_RATINGS);
const starRating = z.coerce.number().int().min(3).max(5).default(5);

export const updateHeroSchema = z.object({
  hero_id: positiveInt,
  rating: heroRating,
});

export const updateArtifactSchema = z.object({
  artifact_id: positiveInt,
  gauge_level: z.coerce.number().int().min(0).max(ARTIFACT_GAUGE_MAX),
});

export const addHeroSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  class: heroClass,
  element,
  star_rating: starRating,
  base_hero_id: optionalPositiveInt,
});

export const addArtifactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  class: artifactClass,
  star_rating: starRating,
  base_artifact_id: optionalPositiveInt,
});

export const deleteHeroSchema = z.object({
  hero_id: positiveInt,
});

export const deleteArtifactSchema = z.object({
  artifact_id: positiveInt,
});

export const updateHeroDetailsSchema = z.object({
  hero_id: positiveInt,
  name: z.string().trim().min(1, 'Name is required.'),
  class: heroClass,
  element,
  star_rating: starRating,
});

export const updateArtifactDetailsSchema = z.object({
  artifact_id: positiveInt,
  name: z.string().trim().min(1, 'Name is required.'),
  class: artifactClass,
  star_rating: starRating,
});

export const switchAccountSchema = z.object({
  account_id: positiveInt,
});

export const addAccountSchema = z.object({
  account_name: z.string().trim().min(1, 'Account name is required.'),
});

export const updateAccountSchema = z.object({
  account_id: positiveInt,
  account_name: z.string().trim().min(1, 'Account name is required.'),
});

export const deleteAccountSchema = z.object({
  account_id: positiveInt,
});

export const adminAddBaseHeroSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  class: heroClass,
  element,
  star_rating: starRating,
});

export const adminAddBaseArtifactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  class: artifactClass,
  star_rating: starRating,
});

export const adminDeleteBaseHeroSchema = z.object({
  hero_id: positiveInt,
});

export const adminDeleteBaseArtifactSchema = z.object({
  artifact_id: positiveInt,
});

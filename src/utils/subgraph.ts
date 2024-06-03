import fs from 'fs';
import { resolve } from 'path';

import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

export const loadGqlFromArtifacts = (path: string): DocumentNode => {
  const file = fs.readFileSync(resolve(__dirname, '../artifacts', path), 'utf-8');
  return gql(file);
};

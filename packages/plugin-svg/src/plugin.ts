import fs from 'node:fs';

import { Config, transform } from '@svgr/core';
import type { Plugin } from 'rollipop';

const SVG_EXTENSION = 'svg';

export function svgPlugin(): Plugin {
  return {
    name: 'rollipop:svg',
    config(config) {
      const resolve = (config.resolve ??= {});
      const sourceExtensions = (resolve.sourceExtensions ??= []);
      const assetExtensions = (resolve.assetExtensions ??= []);

      if (!sourceExtensions.includes(SVG_EXTENSION)) {
        sourceExtensions.push(SVG_EXTENSION);
      }

      resolve.assetExtensions = assetExtensions.filter((extension) => extension !== SVG_EXTENSION);
    },
    load: {
      filter: {
        id: /\.svg$/,
      },
      async handler(id) {
        const rawSvg = fs.readFileSync(id, 'utf-8');
        const svgTransformedCode = await transform(
          rawSvg,
          {
            template: defaultTemplate,
            plugins: [require.resolve('@svgr/plugin-jsx')],
            native: true,
          },
          { filePath: id },
        );
        return { code: svgTransformedCode, moduleType: 'jsx' };
      },
    },
  };
}

const SVG_COMPONENT_NAME = 'SvgLogo';
const defaultTemplate: Config['template'] = (variables, { tpl }) => {
  return tpl`${variables.imports};

${variables.interfaces};

const ${SVG_COMPONENT_NAME} = (${variables.props}) => (
  ${variables.jsx}
);

export default ${SVG_COMPONENT_NAME};`;
};

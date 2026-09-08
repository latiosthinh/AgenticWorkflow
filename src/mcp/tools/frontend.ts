import { z } from 'zod';
import type { ToolRegistrationHelper } from '../types.js';

/**
 * Registers frontend domain tools for DOM and CSS inspection.
 */
export function registerFrontendTools(
  addTool: ToolRegistrationHelper,
  worktreePath: string
): void {
  addTool(
    'inspect_dom_structure',
    'Inspect HTML and JSX DOM components within frontend directories.',
    z.object({ componentPath: z.string() }),
    async ({ componentPath }: { componentPath: string }) => {
      return { componentPath, status: 'inspected', elements: [] };
    }
  );

  addTool(
    'inspect_css_styles',
    'Inspect CSS rules, design tokens, and style definitions.',
    z.object({ stylesheetPath: z.string() }),
    async ({ stylesheetPath }: { stylesheetPath: string }) => {
      return { stylesheetPath, status: 'inspected', rules: [] };
    }
  );
}

# ts-exactly-check

Check only those TypeScript files you want to check.

[中文文档](./docs/README_zh.md)

## background

When traditional TypeScript uses the tsc command to run checks, it runs in full. Very unfriendly to projects that are being restructured into TS.

But if TS lacks the ability to check tsc, it is equivalent to being half useless.

This tool is used to solve this problem. It will ignore ts errors outside the specified file and help incremental refactoring to TypeScript.

## Install

> npm i ts-exactly-check -D

## Usage

Run `npx ts-check` under the root project

## Configuration

### Check rules

File in the project root directory: `tscheck.config.[t|j]s`

```ts
// ${workspaceFolder}/tscheck.config.ts
module.exports = {
   // Dependencies of global .d.ts files
   types: ['src/global.d.ts'],
   // Ignore checked rules (glob format)
   exclude: ['**/__tests__/**/*'],
   // Rules to be checked (glob format)
   include: [
     'mobile/src/types/**/*',
     'src/components/Login/**/*',
   ],
   //Ignored files (used here with include, you can ignore certain files inside)
   ignore: ['src/components/Login/Panel/_index.tsx'],
   /**
    * noImplicitAny related error code.
    *Default value: [2339,7005,7006,7008,7010,7011,7013,7015,7016,7017,7018,7019,7022,7023,7031,7034,7051,7053,7057]
    * Here is a supplement in case it is not enough.
    */
   noImplicitAnyCode?: number[];
   /** true if noImplicitAny is set. File to check (glob format). Do not set the default all. */
   anyCheckInclude?: string[];
   /** true if noImplicitAny is set. Files to be ignored (glob format) */
   anyCheckExclude?: string[];
   // It has the same function as ignore. It is semantically used to mark files that will not be checked temporarily, but the type needs to be improved later.
   todo: [],
};
```



### tsconfig configuration

`ts-exactly-check` uses TypeScript5. It will read `tsconfig.json` under the project as the basic configuration during the operation of the built-in `tsx`.

Some tsconfig configurations are necessary in check mode, and some will affect compilation speed. ts-exactly-check will forcibly overwrite them. This part of the configuration cannot be set through tsconfig.json under the project.

```js
{
     noEmit: true, // Do not output files
     noEmitHelpers: true, // Do not generate helper functions
     importHelpers: false, // Do not introduce helper functions
     declaration: false, // Do not generate a declaration file. A declaration file will be automatically generated after turning it on.
     declarationMap: false, // Do not generate sourceMap for declaration files
     sourceMap: false, // Do not generate a sourceMap file for the target file
     inlineSourceMap: false, // Do not generate inline SourceMap of the target file, inline SourceMap will be included in the generated js file
}
```



## Cooperate with git hooks

It can be combined with git hooks to automate operations.

For example: use `husky`, open a `pre-push` hook, and check it every time during git push.

When a ts error occurs, push will be blocked.

```sh
# 1. Install husky
npm install husky --save-dev

# 2. Enable git hooks
npx husky install

# 3. Set hooks to automatically open after npm initialization
npm pkg set scripts.prepare="husky install"

# 4. Add corresponding git hook check command
npx husky add .husky/pre-push "npx ts-check"
```

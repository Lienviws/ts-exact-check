# ts-exact-check

只检查你想检查的那些 TypeScript 文件。

## 背景

传统的 TypeScript 在使用 tsc 命令跑检查时，是全量跑。对于在重构成 TS 的项目很不友好。

但是 TS 如果少了 tsc 检查的能力，相当于废了一半。

这个工具就是用来解决这个问题的，它会忽略指定文件之外的 ts error，帮助增量式重构为 TypeScript。

## 安装

>  npm i ts-exact-check -D

## 使用方式

根项目下运行 `npx ts-check`

## 配置

### 检查规则

在项目根目录下的文件:  `tscheck.config.[t|j]s`

```ts
// ${workspaceFolder}/tscheck.config.ts
module.exports = {
  // 全局 .d.ts 文件的依赖
  types: ['src/global.d.ts'],
  // 忽略检查的规则(glob 格式)
  exclude: ['**/__tests__/**/*'],
  // 需要检查的规则(glob 格式)
  include: [
    'mobile/src/types/**/*',
    'src/components/Login/**/*',
  ],
  // 忽略的文件(这里是和 include 配合使用的，可以忽略里面的某几个文件)
  ignore: ['src/components/Login/Panel/_index.tsx'],
  // 和 ignore 作用一样，语义上用来标记暂时不检查，但后续需要完善类型的文件
  todo: [],
};
```



### tsconfig 配置

`ts-exact-check` 使用 TypeScript5。它会读取项目下的 `tsconfig.json`，作为内置 `tsx`运行期间的基础配置。

有一些 tsconfig 的配置在检查模式下是必要的，还有一些会影响编译速度，ts-exact-check 会将它们强行覆盖，这部分的配置无法通过项目下的 tsconfig.json 设置。

```js
{
    noEmit: true, // 不输出文件
    noEmitHelpers: true, // 不生成 helper 函数
    importHelpers: false, // 不引入 helper 函数
    declaration: false, // 不生成声明文件，开启后会自动生成声明文件
    declarationMap: false, // 不为声明文件生成sourceMap
    sourceMap: false, // 不生成目标文件的sourceMap文件
    inlineSourceMap: false, // 不生成目标文件的inline SourceMap，inline SourceMap会包含在生成的js文件中
}
```



## 和 git hooks 配合

可以结合 git 的钩子，做自动化运行。

比如：使用 `husky`，开一个 `pre-push` 的钩子，每次在 git push 的时候做检查。

当出现 ts error 的时候，会阻塞 push。

```sh
# 1. 安装 husky
npm install husky --save-dev

# 2. 开启 git hooks
npx husky install

# 3. 设置在 npm 初始化后自动开启 hooks
npm pkg set scripts.prepare="husky install"

# 4. 增加对应的 git 钩子检查命令
npx husky add .husky/pre-push "npx ts-check"
```


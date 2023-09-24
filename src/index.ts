import * as ts from "typescript";
import * as chalk from "chalk";
import {
  Config,
  getSysTime,
  getTsConfig,
  getUserConfig,
  isMatchFile,
} from "./lib";

export { TSCheckConfig } from "./lib";

/**
 * Compiler-API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
 */

async function main() {
  console.log(chalk.blue("【提示】准备开始检查 ts 类型"));
  const tsConfigContent = getTsConfig();
  const config = await getUserConfig(tsConfigContent);
  if (!config) {
    console.log(chalk.blue("【提示】未读取到配置，不再检查"));
    process.exit(0);
  }
  console.log(
    chalk.blue(
      `【提示】配置读取完毕, 开始扫描, 共${config.include.length}个文件`
    ),
    `${getSysTime()}ms`
  );

  /**
   * 编译配置
   */
  const compilerOptions: ts.CompilerOptions = {
    ...tsConfigContent.options,
    noEmit: true, // 不输出文件
    noEmitHelpers: true, // 不生成 helper 函数
    importHelpers: false, // 不引入 helper 函数
    declaration: false, // 不生成声明文件，开启后会自动生成声明文件
    declarationMap: false, // 不为声明文件生成sourceMap
    sourceMap: false, // 不生成目标文件的sourceMap文件
    inlineSourceMap: false, // 不生成目标文件的inline SourceMap，inline SourceMap会包含在生成的js文件中
    ...config.__innerConfig,
  };

  compile([...config.types, ...config.include], compilerOptions, config);
}

/**
 * 编译文件，检查类型
 */
function compile(
  fileNames: string[],
  options: ts.CompilerOptions,
  config: Config
) {
  const program = ts.createProgram({
    rootNames: fileNames,
    options,
  });
  const excludes = [...config.originExclude, ...config.ignore, ...config.todo];
  let errorLength = 0;

  const emitResult = program.emit();

  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  allDiagnostics.forEach((diagnostic) => {
    if (diagnostic.file) {
      // 这块是文件内的 ts error
      if (
        !isMatchFile(config.originInclude, excludes, diagnostic.file.fileName)
      ) {
        return;
      }

      const { line, character } = ts.getLineAndCharacterOfPosition(
        diagnostic.file,
        diagnostic.start!
      );
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n"
      );
      console.log(
        chalk.red(
          `${diagnostic.file.fileName} (${line + 1},${
            character + 1
          }): ${message}`
        )
      );
      errorLength++;
    } else {
      // 这里一般是配置错误
      console.log(
        chalk.red(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
      );
      errorLength++;
    }
  });

  const timeInfo = `${getSysTime()}ms`;

  if (errorLength > 0) {
    console.log(
      chalk.redBright(`【结果】请检查并修复 ts error (${errorLength}条)`),
      timeInfo
    );
    process.exit(1);
  } else {
    console.log(chalk.green("【结果】未检测到 ts error"), timeInfo);
    process.exit(0);
  }
}

main();

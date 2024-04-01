import * as ts from "typescript";
import * as chalk from "chalk";
import {
  Config,
  getSysTime,
  getTsConfig,
  getUserConfig,
  isMatchFile,
  isMatchNoImplicitAnyCheckFile,
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

  compile([...config.types, ...config.fileInclude], compilerOptions, config);
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
  let errorLength = 0;

  const emitResult = program.emit();

  console.log(chalk.blue("【提示】扫描完毕, 准备输出"), `${getSysTime()}ms`);

  // 获取语义诊断信息
  const allDiagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  // 创建一个 FormatDiagnosticsHost 对象
  const formatDiagnosticsHost: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => ts.sys.newLine,
  };

  allDiagnostics.forEach((diagnostic) => {
    const { code } = diagnostic;
    if (diagnostic.file) {
      const { fileName } = diagnostic.file;

      // 这块是文件内的 ts error
      if (!isMatchFile(fileName, config)) {
        return;
      }

      /** 忽略 noImplicitAny 的文件的检查 */
      if (
        config.noImplicitAnyCode.includes(code) && // noImplicitAny 的 error code(即确认这条error属于noImplicitAny配置)
        !isMatchNoImplicitAnyCheckFile(fileName, config)
      ) {
        return;
      }
    } else {
      // 这里一般是配置错误
    }
    const colorMessage = ts.formatDiagnosticsWithColorAndContext(
      [diagnostic],
      formatDiagnosticsHost
    );
    console.log(colorMessage);
    errorLength++;
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

import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import * as glob from "glob";
import * as util from "util";
import * as micromatch from "micromatch";

export interface TSCheckConfig {
  /** 全局 .d.ts 文件的依赖 */
  types?: string[];
  /** 忽略的规则(glob 格式) */
  exclude?: string[];
  /** 需要检查的文件(glob 格式) */
  include?: string[];
  /** 忽略的文件(这里是和 include 配合使用的，可以忽略里面的某几个文件) */
  ignore?: string[];
  /** 如果设置了 noImplicitAny true。需要检查的文件(glob 格式)。不设置默认全部。 */
  anyCheckInclude?: string[];
  /** 如果设置了 noImplicitAny true。需要忽略的文件(glob 格式) */
  anyCheckExclude?: string[];
  /** 和 ignore 作用一样，语义上用来标记暂时不检查，但后续需要完善类型的文件 */
  todo?: string[];
  /** 保留用，用来调试。这个配置可以覆盖内部的 TSConfig 配置 */
  __innerConfig?: ts.CompilerOptions;
}

export interface Config extends Required<TSCheckConfig> {
  originInclude: string[];
  originExclude: string[];
}

export const rootPath = process.cwd();
const globPromise = util.promisify(glob);
const configName = "tscheck.config.*";

/**
 * 读取工具配置
 */
async function readConfig() {
  const files = await globPromise(path.join(rootPath, configName));
  if (!files.length) return false;
  const configPath = files[0];
  let originConfig: TSCheckConfig | null = null;
  if (configPath.endsWith(".js") || configPath.endsWith(".ts")) {
    originConfig = require(configPath) as TSCheckConfig;
  } else if (configPath.endsWith(".json")) {
    const configStr = fs.readFileSync(configPath).toString();
    originConfig = JSON.parse(configStr) as TSCheckConfig;
  } else {
    return false;
  }
  return originConfig;
}

/**
 * 读取文件检查配置
 */
export async function getUserConfig(tsconfig: ts.ParsedCommandLine) {
  let originConfig: TSCheckConfig | boolean = await readConfig();
  if (!originConfig) return false;

  const {
    exclude = [],
    types = [],
    ignore = [],
    include = [],
    anyCheckInclude = [],
    anyCheckExclude = [],
    todo = [],
    __innerConfig = {},
  } = originConfig;

  const originExclude: string[] = [
    ...(tsconfig.raw?.exclude || []), // 读取配置项里的 exclude
    ...exclude,
  ];

  const calcExclude: string[] = [...originExclude, ...ignore, ...todo];

  const includeFileList = await getGlobTSFiles(include);
  const typesFileList = await getGlobTSFiles(types);

  // 排除掉 exclude 的文件
  const matchIncludeFileList = includeFileList.filter(
    (pathItem) =>
      !micromatch.isMatch(path.relative(rootPath, pathItem), calcExclude)
  );
  const matchTypesFileList = typesFileList.filter(
    (pathItem) =>
      !micromatch.isMatch(path.relative(rootPath, pathItem), calcExclude)
  );

  const config: Config = {
    ...originConfig,
    exclude: originExclude,
    types: matchTypesFileList,
    ignore: ignore,
    todo: todo,
    include: matchIncludeFileList,
    __innerConfig,
    originInclude: include,
    originExclude,
    anyCheckInclude,
    anyCheckExclude,
  };
  return config;
}

/**
 * 拼接完整路径
 */
async function getGlobTSFiles(files?: string[]) {
  if (!files || !files.length) return [];
  const fullPathFiles = files.map((pathItem) => path.join(rootPath, pathItem));

  const flatFileList: string[] = [];

  const fullGlobedPathFiles = await Promise.all(
    fullPathFiles.map((pathItem) => globPromise(pathItem))
  );
  fullGlobedPathFiles.forEach((files) => {
    // 只检查 ts 文件
    const filteredFiles = files.filter(
      (item) => item.endsWith(".ts") || item.endsWith(".tsx")
    );
    flatFileList.push(...filteredFiles);
  });
  return flatFileList;
}

/**
 * 读取tsconfig配置
 */
export function getTsConfig() {
  const tsconfigPath = ts.findConfigFile(
    rootPath,
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!tsconfigPath) throw new Error("找不到 tsconfig.json 配置文件");
  const configObj = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configObj.error) throw configObj.error;
  const tsConfigContent = ts.parseJsonConfigFileContent(
    configObj.config,
    ts.sys,
    "."
  );

  if (tsConfigContent.errors.length) throw tsConfigContent.errors;
  return tsConfigContent;
}

/**
 * 检查文件是否满足 include 和 exclude 的规则
 */
export function isMatchFile(
  include: string[] = [],
  exclude: string[] = [],
  targetPath: string
) {
  const relativePath = path.relative(rootPath, targetPath);
  const includeMatch = include.find((includePath) =>
    micromatch.isMatch(relativePath, includePath)
  );
  const excludeMatch = exclude.find((excludePath) =>
    micromatch.isMatch(relativePath, excludePath)
  );
  return includeMatch && !excludeMatch;
}

/**
 * 检查文件是否满足 anyCheckInclude 和 anyCheckExclude 的规则
 */
export function isMatchNoImplicitAnyCheckFile(
  include: string[] = [],
  exclude: string[] = [],
  targetPath: string
) {
  const relativePath = path.relative(rootPath, targetPath);
  const includeMatch =
    include.length === 0 ||
    include.find((includePath) =>
      micromatch.isMatch(relativePath, includePath)
    );
  const excludeMatch = exclude.find((excludePath) =>
    micromatch.isMatch(relativePath, excludePath)
  );
  return includeMatch && !excludeMatch;
}

/**
 * 属于 noImplicitAny 的错误
 */
export function isMatchAnyCheck(message: string | ts.DiagnosticMessageChain) {
  const keyMessage = `implicitly has an 'any' type.`;
  if (typeof message === "string") {
    if (message.endsWith(keyMessage)) return true;
  } else {
    if (message.messageText.endsWith(keyMessage)) return true;
  }
  return false;
}

export function getSysTime() {
  const time = Math.floor(process.uptime() * 1000);
  return time;
}

import * as ts from "typescript";
import * as path from "path";
import { glob } from "glob";
import { minimatch } from "minimatch";
import { cosmiconfigSync } from "cosmiconfig";

export interface TSCheckConfig {
  /** 全局 .d.ts 文件的依赖 */
  types?: string[];
  /** 需要检查的文件(glob 格式) */
  include?: string[];
  /** 忽略的规则(glob 格式) */
  exclude?: string[];
  /** 需要检查的文件路径，以根目录为起始路径的绝对路径 */
  fileInclude?: string[];
  /** 需要忽略的文件路径，以根目录为起始路径的绝对路径 */
  fileExclude?: string[];
  /** 如果设置了 noImplicitAny true。需要检查的文件(glob 格式)。不设置默认全部。 */
  anyCheckInclude?: string[];
  /** 如果设置了 noImplicitAny true。需要忽略的文件(glob 格式) */
  anyCheckExclude?: string[];
  anyCheckFileInclude?: string[];
  anyCheckFileExclude?: string[];
  /**
   * noImplicitAny 相关的 error code。
   * 默认值：[2339,7005,7006,7008,7010,7011,7013,7015,7016,7017,7018,7019,7022,7023,7031,7034,7051,7053,7057]
   * 这里是防止不够用，作为补充。
   */
  noImplicitAnyCode?: number[];
  /** 保留用，用来调试。这个配置可以覆盖内部的 TSConfig 配置 */
  __innerConfig?: ts.CompilerOptions;
}

export interface Config extends Required<TSCheckConfig> {}

export const rootPath = process.cwd();
const configName = "tscheck";

const defaultNoImplicitAnyCode = [
  // 未定义的属性
  2339,
  // 变量是any类型
  7005,
  // 参数是any类型
  7006,
  // 类成员隐式为any
  7008,
  // 函数类型返回值推导是any
  7010,
  // 函数表达式返回值推导是any
  7011,
  // Rest parameter 是 any 类型(和7019一样)
  7013,
  // 试图访问数组时类型不匹配，导致隐式推导为any
  7015,
  // npm包缺少类型
  7016,
  // 无法确认尝试访问的对象的属性类型
  7017,
  // 变量作为对象的属性，但是对象没有定义类型
  7018,
  // Rest parameter 是 any 类型
  7019,
  // 函数结果赋予变量的类型隐式为any
  7022,
  // 函数推导的返回值是any
  7023,
  // 对象解构的属性是any
  7031,
  // 变量推导结果是any的数组
  7034,
  // 参数有名字，但是没类型，识别是any
  7051,
  // 对象是空的，隐式推导为any
  7053,
  // yield 推导的结果是 any
  7057,
];

function getConfigFile(name: string): TSCheckConfig | null {
  const explorerSync = cosmiconfigSync(name);
  const searchedFor = explorerSync.search();

  if (searchedFor?.isEmpty) {
    return null;
  } else {
    return searchedFor?.config as TSCheckConfig;
  }
}

/**
 * 读取文件检查配置
 */
export async function getUserConfig(tsconfig: ts.ParsedCommandLine) {
  const originConfig = getConfigFile(configName);
  if (!originConfig) return false;

  const {
    types = [],
    include = [],
    exclude = [],
    fileInclude = [],
    fileExclude = [],
    anyCheckInclude = [],
    anyCheckExclude = [],
    anyCheckFileInclude = [],
    anyCheckFileExclude = [],
    noImplicitAnyCode = defaultNoImplicitAnyCode,
    __innerConfig = {},
  } = originConfig;

  const combineExclude: string[] = [
    ...(tsconfig.raw?.exclude || []), // 读取配置项里的 exclude
    ...exclude,
  ];

  const fullPathExclude = getFullPath(combineExclude);
  const fileFullPathExclude = getFullPath(fileExclude);
  const anyCheckFileFullExclude = getFullPath(anyCheckFileExclude);

  const ignoreOptions = {
    excludeFiles: fileFullPathExclude,
    excludeGlob: fullPathExclude,
  };

  // 配置合并，以及file类型的路径拼接
  let config: Config = {
    types,
    include,
    exclude: fullPathExclude,
    fileInclude: getFullPath(fileInclude, ignoreOptions),
    fileExclude: fileFullPathExclude,
    anyCheckInclude,
    anyCheckExclude,
    anyCheckFileInclude: getFullPath(anyCheckFileInclude, ignoreOptions),
    anyCheckFileExclude: anyCheckFileFullExclude,
    noImplicitAnyCode,
    __innerConfig,
  };

  // ts 接收的是完整路径，所以要用glob去读。anyCheckInclude 这里是为了统一这个逻辑，顺便读的
  config = {
    ...config,
    types: await getGlobTSFiles(config.types, ignoreOptions),
    include: await getGlobTSFiles(config.include, ignoreOptions),
    anyCheckInclude: await getGlobTSFiles(
      config.anyCheckInclude,
      ignoreOptions
    ),
  };

  // 合并去重一下，后续 include部分 就只需要用完整路径去匹配了
  config = {
    ...config,
    fileInclude: [
      ...new Set([...config.fileInclude, ...config.include]),
    ].sort(),
    anyCheckFileInclude: [
      ...new Set([...config.anyCheckFileInclude, ...config.anyCheckInclude]),
    ].sort(),
  };

  return config;
}

/**
 * 通过glob，拼接完整路径
 */
async function getGlobTSFiles(
  pattern: string[],
  options?: {
    excludeFiles?: string[];
    excludeGlob?: string[];
  }
) {
  const { excludeFiles = [], excludeGlob = [] } = options || {};
  const globedPathFiles = await glob(pattern, { ignore: "node_modules/**" });

  const res: string[] = [];
  globedPathFiles.forEach((pathStr) => {
    const fullPath = path.resolve(rootPath, pathStr).split(path.sep).join("/");
    const isTs = fullPath.endsWith(".ts") || pathStr.endsWith(".tsx");
    if (!isTs) return;
    if (multimatch(fullPath, excludeGlob)) return;
    if (excludeFiles.includes(fullPath)) return;
    res.push(fullPath);
  });

  return res;
}

function getFullPath(
  files: string[],
  options?: {
    excludeFiles?: string[];
    excludeGlob?: string[];
  }
) {
  const { excludeFiles = [], excludeGlob = [] } = options || {};

  const res: string[] = [];
  files.forEach((pathStr) => {
    const fullPath = path.resolve(rootPath, pathStr).split(path.sep).join("/");
    if (excludeFiles.includes(fullPath)) return;
    if (multimatch(fullPath, excludeGlob)) return;

    res.push(fullPath);
  });
  return res;
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
export function isMatchFile(targetPath: string, config: Config) {
  return isMatch(targetPath, config);
}

/**
 * 检查文件是否满足 anyCheckInclude 和 anyCheckExclude 的规则
 */
export function isMatchNoImplicitAnyCheckFile(
  targetPath: string,
  config: Config
) {
  const {
    anyCheckInclude,
    anyCheckExclude,
    anyCheckFileInclude,
    anyCheckFileExclude,
  } = config;

  // 当没有配置 anyCheckInclude 和 anyCheckFileInclude 时
  const noIncludeConfig =
    anyCheckInclude.length === 0 && anyCheckFileInclude.length === 0;

  return isMatch(targetPath, {
    exclude: anyCheckExclude,
    fileInclude: anyCheckFileInclude,
    fileExclude: anyCheckFileExclude,
    ignoreInclude: noIncludeConfig,
  });
}

/**
 * 检查文件是否满足 include 和 exclude 的规则\
 * 当不命中 exclude 且命中 include，则返回 true
 */
function isMatch(
  targetPath: string,
  args: {
    exclude: string[];
    fileInclude: string[];
    fileExclude: string[];
    /** ignore 即当做include了 */
    ignoreInclude?: boolean;
  }
) {
  const { exclude, fileInclude, fileExclude, ignoreInclude = false } = args;
  const fullPath = path.resolve(rootPath, targetPath).split(path.sep).join("/");
  const excludeMatch =
    fileExclude.includes(fullPath) || multimatch(targetPath, exclude);
  if (excludeMatch) return false;
  const includeMatch = ignoreInclude || fileInclude.includes(fullPath);
  return includeMatch;
}

function multimatch(pathStr: string, patterns: string[]) {
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    if (minimatch(pathStr, pattern)) {
      return true;
    }
  }
  return false;
}

export function getSysTime() {
  const time = Math.floor(process.uptime() * 1000);
  return time;
}

import { Job, JobInternals } from './job';
import { PipelineTask } from '../tasks/pipeline-task';
import { PipelineParamSpec, PipelineWorkspaceDeclaration } from '../../types';
import { Construct } from 'constructs';

import { GitCloneTask, GitClonePipelineTask } from '../tasks/git-clone.task';
import { GitLogTask, GitLogPipelineTask } from '../tasks/git-log.task';
import { GoTestTask, GoTestPipelineTask } from '../tasks/go-test.task';
import { GoBuildTask, GoBuildPipelineTask } from '../tasks/go-build.task';
import { GenerateSbomTask, GenerateSbomPipelineTask } from '../tasks/generate-sbom.task';
import { VulnScanTask, VulnScanPipelineTask } from '../tasks/vuln-scan.task';
import { KoBuildPipelineTask } from '../tasks/ko-build.task';
import { BuildOciPipelineTask } from '../tasks/build-oci.task';
import { FixFilePermsPipelineTask } from '../tasks/fix-file-perms.task';
import { CosignSignImagePipelineTask } from '../tasks/cosign-sign-image.task';
import { GenerateImageSbomPipelineTask } from '../tasks/generate-image-sbom.task';

import {
  PARAM_GIT_URL,
  PARAM_GIT_REVISION,
  PARAM_APP_ROOT,
  PARAM_BUILD_PATH,
  PARAM_IMAGE_NAME,
  WS_WORKSPACE,
  WS_BASIC_AUTH,
  WS_SSH_DIRECTORY,
  WS_GIT_SOURCE,
  WS_DOCKERCONFIG,
} from '../constants';
import { GOLANG_VERSION_PARAM_SPEC, GOLANG_VARIANT_PARAM_SPEC } from '../params';

const generateSbomFactory = (opts?: { needs?: Job | Job[] }): Job => {
  return Job._prebuilt('generate-sbom', opts?.needs, {
    taskResourceName: GenerateSbomTask.defaultName,
    params: [
      { name: PARAM_APP_ROOT, description: 'path to root of the app', type: 'string' },
    ],
    workspaces: [{ name: WS_WORKSPACE }],
    createTaskResource: (scope, id, namespace) => {
      new GenerateSbomTask(scope, id, { namespace });
    },
    createPipelineTask: (runAfter) => new GenerateSbomPipelineTask({ runAfter }),
  });
};

export const JOBS = {
  clone: (opts?: {
    needs?: Job | Job[];
    basicAuth?: boolean;
    sshDirectory?: boolean;
  }): Job => {
    const workspaces: PipelineWorkspaceDeclaration[] = [{ name: WS_WORKSPACE }];
    if (opts?.basicAuth) workspaces.push({ name: WS_BASIC_AUTH, optional: true });
    if (opts?.sshDirectory) workspaces.push({ name: WS_SSH_DIRECTORY, optional: true });

    return Job._prebuilt('clone', opts?.needs, {
      taskResourceName: GitCloneTask.defaultName,
      params: [
        { name: PARAM_GIT_URL, type: 'string' },
        { name: PARAM_GIT_REVISION, type: 'string' },
      ],
      workspaces,
      createTaskResource: (scope, id, namespace) => {
        new GitCloneTask(scope, id, { namespace });
      },
      createPipelineTask: (runAfter) =>
        new GitClonePipelineTask({
          runAfter,
          basicAuth: opts?.basicAuth,
          sshDirectory: opts?.sshDirectory,
        }),
    });
  },

  gitLog: (opts?: { needs?: Job | Job[] }): Job => {
    return Job._prebuilt('log-git-state', opts?.needs, {
      taskResourceName: GitLogTask.defaultName,
      params: [],
      workspaces: [{ name: WS_WORKSPACE }],
      createTaskResource: (scope, id, namespace) => {
        new GitLogTask(scope, id, { namespace });
      },
      createPipelineTask: (runAfter) => new GitLogPipelineTask({ runAfter }),
    });
  },

  goTest: (opts?: { needs?: Job | Job[]; golangVersion?: string }): Job => {
    const golangVersionParam: PipelineParamSpec = opts?.golangVersion
      ? { ...GOLANG_VERSION_PARAM_SPEC, default: opts.golangVersion }
      : { ...GOLANG_VERSION_PARAM_SPEC };

    return Job._prebuilt('test', opts?.needs, {
      taskResourceName: GoTestTask.defaultName,
      params: [
        { name: PARAM_APP_ROOT, description: 'path to root of the golang app', type: 'string' },
        { name: PARAM_BUILD_PATH, description: 'path under app-root to target', type: 'string' },
        golangVersionParam,
        { ...GOLANG_VARIANT_PARAM_SPEC },
      ],
      workspaces: [{ name: WS_WORKSPACE }],
      createTaskResource: (scope, id, namespace) => {
        new GoTestTask(scope, id, { namespace });
      },
      createPipelineTask: (runAfter) => new GoTestPipelineTask({ runAfter }),
    });
  },

  goBuild: (opts?: { needs?: Job | Job[]; golangVersion?: string }): Job => {
    const golangVersionParam: PipelineParamSpec = opts?.golangVersion
      ? { ...GOLANG_VERSION_PARAM_SPEC, default: opts.golangVersion }
      : { ...GOLANG_VERSION_PARAM_SPEC };

    return Job._prebuilt('build', opts?.needs, {
      taskResourceName: GoBuildTask.defaultName,
      params: [
        { name: PARAM_APP_ROOT, description: 'path to root of the golang app', type: 'string' },
        { name: PARAM_BUILD_PATH, description: 'path under app-root to target', type: 'string' },
        golangVersionParam,
        { ...GOLANG_VARIANT_PARAM_SPEC },
      ],
      workspaces: [{ name: WS_WORKSPACE }],
      createTaskResource: (scope, id, namespace) => {
        new GoBuildTask(scope, id, { namespace });
      },
      createPipelineTask: (runAfter) => new GoBuildPipelineTask({ runAfter }),
    });
  },

  generateSbom: generateSbomFactory,
  sbom: generateSbomFactory,

  vulnScan: (opts?: { needs?: Job | Job[] }): Job => {
    return Job._prebuilt('vulnerability-scan', opts?.needs, {
      taskResourceName: VulnScanTask.defaultName,
      params: [],
      workspaces: [{ name: WS_WORKSPACE }],
      createTaskResource: (scope, id, namespace) => {
        new VulnScanTask(scope, id, { namespace });
      },
      createPipelineTask: (runAfter) => new VulnScanPipelineTask({ runAfter }),
    });
  },

  koBuild: (opts?: { needs?: Job | Job[]; pathToAppRoot?: string }): Job => {
    return Job._prebuilt('build', opts?.needs, {
      taskResourceName: 'ko-build',
      params: [{ name: PARAM_IMAGE_NAME, type: 'string' }],
      workspaces: [{ name: WS_GIT_SOURCE }, { name: WS_DOCKERCONFIG }],
      createTaskResource: null,
      createPipelineTask: (runAfter) =>
        new KoBuildPipelineTask({ runAfter, pathToAppRoot: opts?.pathToAppRoot }),
    });
  },

  buildOci: (opts?: { needs?: Job | Job[] }): Job => {
    return Job._prebuilt('build-image', opts?.needs, {
      taskResourceName: 'build-oci',
      params: [{ name: PARAM_IMAGE_NAME, type: 'string' }],
      workspaces: [{ name: WS_GIT_SOURCE }, { name: WS_DOCKERCONFIG }],
      createTaskResource: null,
      createPipelineTask: (runAfter) => new BuildOciPipelineTask({ runAfter }),
    });
  },

  fixFilePerms: (opts?: { needs?: Job | Job[]; sourceWorkspace?: string }): Job => {
    const wsName = opts?.sourceWorkspace ?? WS_GIT_SOURCE;
    return Job._prebuilt('fix-file-perms', opts?.needs, {
      taskResourceName: 'fix-file-perms',
      params: [],
      workspaces: [{ name: wsName }],
      createTaskResource: null,
      createPipelineTask: (runAfter) =>
        new FixFilePermsPipelineTask({ runAfter, sourceWorkspace: opts?.sourceWorkspace }),
    });
  },

  cosignSign: (opts?: { needs?: Job | Job[]; buildStep?: Job }): Job => {
    return Job._prebuilt('sign-image', opts?.needs, {
      taskResourceName: 'cosign-sign-image',
      params: [{ name: PARAM_IMAGE_NAME, type: 'string' }],
      workspaces: [{ name: WS_GIT_SOURCE }, { name: WS_DOCKERCONFIG }],
      createTaskResource: null,
      createPipelineTask: (runAfter) =>
        new CosignSignImagePipelineTask({
          runAfter,
          buildStep: opts?.buildStep
            ? ({ name: opts.buildStep.name } as PipelineTask)
            : undefined,
        }),
    });
  },

  generateImageSbom: (opts?: { needs?: Job | Job[]; buildStep?: Job }): Job => {
    return Job._prebuilt('generate-image-sbom', opts?.needs, {
      taskResourceName: 'vuln-scan',
      params: [{ name: PARAM_IMAGE_NAME, type: 'string' }],
      workspaces: [{ name: WS_GIT_SOURCE }, { name: WS_DOCKERCONFIG }],
      createTaskResource: null,
      createPipelineTask: (runAfter) =>
        new GenerateImageSbomPipelineTask({
          runAfter,
          buildStep: opts?.buildStep
            ? ({ name: opts.buildStep.name } as PipelineTask)
            : undefined,
        }),
    });
  },
};

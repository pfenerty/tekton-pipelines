import { Construct } from 'constructs';
import { Chart, ChartProps } from 'cdk8s';
import { ContainerImageBuildPipeline } from '../lib/pipelines/container-image-build.pipeline';
import { OciBuildPipeline } from '../lib/pipelines/oci-build.pipeline';

export interface OciPipelinesChartProps extends ChartProps {
  namespace: string;
}

/**
 * Chart that provisions OCI container image build pipelines.
 *
 * These pipelines reference external Tasks that must be installed separately
 * in the cluster (they are not part of this repo):
 *   fix-file-perms    - fixes workspace file permissions
 *   ko-build          - builds images with Ko
 *   build-oci         - builds images with Buildah/Kaniko
 *   vuln-scan         - vulnerability scan on an OCI image
 *   cosign-sign-image - signs images with Cosign
 *
 * Pipelines:
 *   container-image-build - fix-perms → clone → ko-build
 *   oci-build             - fix-perms → clone → build-oci → sbom/vuln-scan → sign
 */
export class OciPipelinesChart extends Chart {
  constructor(scope: Construct, id: string, props: OciPipelinesChartProps) {
    super(scope, id, props);

    const namespace = props.namespace;

    new ContainerImageBuildPipeline(this, 'container-image-build-pipeline', { namespace });
    new OciBuildPipeline(this, 'oci-build-pipeline', { namespace });
  }
}

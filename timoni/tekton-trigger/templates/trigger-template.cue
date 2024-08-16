package templates

import (
	tektonv1 "triggers.tekton.dev/triggertemplate/v1beta1"
)

#TriggerTemplate: tektonv1.#TriggerTemplate & {
	#config:    #Config
	apiVersion: "triggers.tekton.dev/v1beta1"
	kind:       "TriggerTemplate"
	metadata:   #config.metadata
	spec: {
		params: [
			{
				name:        "gitrevision"
				description: "git revision to clone"
			},
			{
				name:        "gitrepositoryurl"
				description: "git repository url"
			}
		]
		resourceTemplates: [
			{
				apiVersion: "tekton.dev/v1beta1"
				kind: "PipelineRun"
				metadata: {
					generateName: #config.metadata.name + "-pipeline-run-"
					namespace: #config.metadata.namespace
					labels: #config.metadata.labels
				}
				spec: {
					params: [
						{name: "git-revision", value: "$(tt.params.gitrevision)"},
						{name: "git-url", value: "$(tt.params.gitrepositoryurl)"},
						{name: "app-root", value: #config.pipeline.appRoot},
						{name: "build-path", value: #config.pipeline.buildPath}
					]
					pipelineRef: {
						name: "go-build"
					}
					serviceAccountName: #config.metadata.name
					workspaces: [
						{
							name: "filesystem"
							volumeClaimTemplate: {
								spec: {
									accessModes: ["ReadWriteOnce"]
									resources: {
										requests: {
											storage: #config.pipeline.workspaceStorage
										}
									}
								}
							}
						}
					]
				}
			}
		]
	}
}

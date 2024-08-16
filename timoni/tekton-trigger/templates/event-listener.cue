package templates

import (
	tektonv1 "triggers.tekton.dev/eventlistener/v1beta1"
)

#EventListener: tektonv1.#EventListener & {
	#config:    #Config
	apiVersion: "triggers.tekton.dev/v1beta1"
	kind:       "EventListener"
	metadata:   #config.metadata
	spec: {
		serviceAccountName: #config.metadata.name
		triggers: [{
			bindings: [{
				kind: "TriggerBinding"
				ref:  "github-push-pipelinebinding"
			}]
			interceptors: [{
				params: [{
					name: "eventTypes"
					value: ["push"]
				}]
				ref: {
					kind: "ClusterInterceptor"
					name: #config.pipeline.gitSource
				}
			}]
			template: {
				ref: "github-push-triggertemplate"
			}
		}]
	}
}

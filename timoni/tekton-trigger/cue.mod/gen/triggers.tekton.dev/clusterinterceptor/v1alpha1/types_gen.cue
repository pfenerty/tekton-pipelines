// Code generated by timoni. DO NOT EDIT.

//timoni:generate timoni vendor crd -f https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml

package v1alpha1

import "strings"

#ClusterInterceptor: {
	apiVersion: "triggers.tekton.dev/v1alpha1"
	kind:       "ClusterInterceptor"
	metadata!: {
		name!: strings.MaxRunes(253) & strings.MinRunes(1) & {
			string
		}
		namespace?: strings.MaxRunes(63) & strings.MinRunes(1) & {
			string
		}
		labels?: {
			[string]: string
		}
		annotations?: {
			[string]: string
		}
	}
	...
}

// Code generated by timoni. DO NOT EDIT.

//timoni:generate timoni vendor crd -f https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml

package v1alpha1

import "strings"

#StepAction: {
	apiVersion: "tekton.dev/v1alpha1"
	kind:       "StepAction"
	metadata!: {
		name!: strings.MaxRunes(253) & strings.MinRunes(1) & {
			string
		}
		namespace!: strings.MaxRunes(63) & strings.MinRunes(1) & {
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

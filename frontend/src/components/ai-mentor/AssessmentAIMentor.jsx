import React from 'react'
import PropTypes from 'prop-types'
import QuizAiAssistant from '../QuizAiAssistant'
import CodingAiAssistant from '../CodingAiAssistant'

/**
 * The single assessment-facing AI Mentor entry point.
 *
 * Quiz and coding retain their domain-specific request/state adapters, while
 * assessment pages mount only this component and therefore cannot accidentally
 * create competing mentor surfaces.
 */
const AssessmentAIMentor = React.memo(function AssessmentAIMentor({ assessmentType, ...props }) {
  if (String(assessmentType).toUpperCase() === 'CODING') {
    return <CodingAiAssistant key={`${props.user?.id}:${props.attemptId}`} {...props} />
  }

  return <QuizAiAssistant {...props} />
})

AssessmentAIMentor.propTypes = {
  assessmentType: PropTypes.oneOf(['QUIZ', 'CODING']).isRequired,
}

export default AssessmentAIMentor

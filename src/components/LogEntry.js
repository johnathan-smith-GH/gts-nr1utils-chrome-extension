import React, { useRef, useEffect } from '../../snowpack/pkg/react.js';

const LogEntry = props => {
  const {
    request,
    idx,
    setCurrentQueryIdx,
    isSelected,
    className,
    isChecked,
    onToggleSelect,
    now
  } = props;
  const ref = useRef(null);

  useEffect(() => {
    if (isSelected) {
      ref.current?.focus();
      ref.current?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [isSelected]);

  // Elapsed time for pending requests — driven by shared `now` prop from parent
  var timingStartTime = request.timing ? request.timing.startTime : 0;
  var elapsed = (request.status === 'pending' && request.timing) ? (now || Date.now()) - timingStartTime : 0;

  const handleKeyDown = event => {
    if (event.key === 'Enter') {
      setCurrentQueryIdx(idx);
    }
  };

  const logRequest = request;
  const isPlaceholder = request._isPlaceholder;
  const isPending = request.status === 'pending';
  const isTimeout = !isPending && !isPlaceholder && !!request._isTimeout;
  const isError = !isPending && !isPlaceholder && !!request.errors;

  const truncateName = name => name.length > 28 ? `${name.slice(0, 28)}...` : name;

  var name = logRequest.name ? truncateName(logRequest.name) : 'Unknown';
  var errors = logRequest.errors || null;

  const handleCheckboxChange = (e) => {
    e.stopPropagation();
    onToggleSelect(props.rid);
  };

  // Determine timing label and value
  var timingLabelClass = 'App-requestTimingLabel';
  var timingValueClass = 'App-requestTimingValue';
  var timingLabel = 'Response time';
  var timingValue;

  if (isPlaceholder) {
    timingLabelClass += ' App-requestTimingLabel--defined';
    timingLabel = 'Defined in widget';
    timingValue = request._widgetTitle || '';
  } else if (isPending) {
    timingLabelClass += ' App-requestTimingLabel--pending';
    timingValueClass += ' App-requestTimingValue--pending';
    timingLabel = 'Pending';
    timingValue = Math.round(elapsed) + 'ms';
  } else if (isTimeout) {
    timingLabelClass += ' App-requestTimingLabel--timeout';
    timingValueClass += ' App-requestTimingValue--timeout';
    timingValue = Math.round(request.timing ? request.timing.totalTime : 0) + 'ms';
  } else {
    timingValue = Math.round(request.timing ? request.timing.totalTime : 0) + 'ms';
    if (request.timing && request.timing.blockedTime > 0) {
      timingValue += ' (blocked ' + Math.round(request.timing.blockedTime) + 'ms)';
    }
  }

  // Type badge class
  var typeClass = 'App-requestType';
  if (isPlaceholder) {
    typeClass += ' App-requestType--defined';
  } else if (request.type === 'TRACE') {
    typeClass += ' App-requestType--trace';
  } else if (isPending) {
    typeClass += ' App-requestType--pending';
  } else if (isError) {
    typeClass += ' App-requestType--withErrors';
  } else {
    typeClass += ' App-requestType--success';
  }

  return /*#__PURE__*/React.createElement("li", {
    onClick: () => setCurrentQueryIdx(idx),
    className: className,
    tabIndex: 0,
    onKeyDown: handleKeyDown,
    ref: ref
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    className: "App-log-checkbox",
    checked: isChecked,
    onChange: handleCheckboxChange,
    onClick: (e) => e.stopPropagation()
  }), /*#__PURE__*/React.createElement("div", {
    className: "App-logEntryContent"
  }, /*#__PURE__*/React.createElement("div", {
    className: "App-logEntryRow1"
  }, /*#__PURE__*/React.createElement("span", {
    className: typeClass
  }, request.type), /*#__PURE__*/React.createElement("span", {
    className: `App-requestName ${isError ? 'App-requestName--withErrors' : ''}`,
    title: name
  }, name)), /*#__PURE__*/React.createElement("div", {
    className: "App-logEntryRow2"
  }, /*#__PURE__*/React.createElement("span", {
    className: timingLabelClass
  }, timingLabel), /*#__PURE__*/React.createElement("span", {
    className: timingValueClass
  }, timingValue))));
};

export default /*#__PURE__*/React.memo(LogEntry);

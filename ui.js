function uiState() {
	
	var that = this;
	var lastMsgSrc = null;   // source of the last message displayed
	var lastMsgDest = null;  // destination of the last message sent
		
	this.disconnected = function() {
		that.displaySystemMessage("Connection to the Starfleet subspace network interrupted.");
		that.displaySystemMessage("Attempting to reconnect...");
		$(".connected").attr("disabled", "disabled");				
		if (endpoint) {
			$(".haveEndpoint").removeClass("clickable");
			$(".haveEndpoint").addClass("disabled");
		}
	}
	
	this.connected = function() {
		that.displaySystemMessage("Connected.");
		// update the screen
		var epid = $("#endpoint").val();
		$("#status").html("USER: " + epid);
		
		// swap the display state to "logged in"
		$(".disconnected").attr("disabled", "disabled");
		$(".connected").removeAttr("disabled");
		$("#ssc").css("display", "none");
		$("#login").css("display", "none");
		$(".messaging").css("display", "block");
		
		var remoteId = $("#endpoints").val();
		if (remoteId == "group-message") {
			that.groupSelected();
		} else {
			that.endpointSelected(remoteId);
		}
		
		$("#textToSend").focus();
	}
	
	this.loggedOut = function() {
		$("#status").html("Not Connected");
		$(".disconnected").removeAttr("disabled");
		$(".connected").attr("disabled", "disabled");
		$(".haveEndpoint").attr("disabled", "disabled");
		$(".messaging").css("display", "none");
		$("#ssc").css("display", "block");
		$("#login").css("display", "block");
		$("#endpoints").empty();
		$("#messages").empty();
		// play the "somebody left" tone
		leaveTone.play();
	}
	
	// a specific endpoint has been selected
	this.endpointSelected = function(epid) {
			$(".haveEndpoint").removeClass("disabled");
			$(".haveEndpoint").addClass("clickable");
			that.displaySystemMessage("Selected Contact: " + epid);
	}
	
	// the group has been selected
	this.groupSelected = function() {
		$(".haveEndpoint").addClass("disabled");
		$(".haveEndpoint").removeClass("clickable");
		that.displaySystemMessage("Selected Contact: Everyone (Group Messaging)");
	}
	
	// transition the call control elements to their idle states
	this.idle = function() {
		var vo = $("#videoOverlay");
		vo.empty();
		vo.css("display", "none");
		$(".haveCall").addClass("disabled");
		$(".haveCall").removeClass("clickable");
		$(".haveEndpoint").removeClass("disabled");
		$(".haveEndpoint").addClass("clickable");
	}
	
	// enable controls for an audio call
	this.audioActive = function() {
		// add mute and volume?

	}
	
	// enable display of call state dialog
	this.audioPending = function() {
		// disable call buttons
		$(".haveEndpoint").addClass("disabled");
		$(".haveEndpoint").removeClass("clickable");
		// enable call control buttons
		$(".haveCall").removeClass("disabled");
		$(".haveCall").addClass("clickable");
	}
	
	// enable controls for a video + audio call
	this.videoActive = function(element) {
		var vo = $("#videoOverlay");
		vo.append(element);
		vo.css("display", "block");
	}
	
	// enable display of call state dialog
	this.videoPending = function() {
		// disable call buttons
		$(".haveEndpoint").addClass("disabled");
		$(".haveEndpoint").removeClass("clickable");
		// enable call control buttons
		$(".haveCall").removeClass("disabled");
		$(".haveCall").addClass("clickable");
	}
	
	this.incomingCall = function(call, done) {
	  // Update the display namespace
	  //$("#name").html(call.endpoint.id);
	  // display the incoming call dialog
	  // $("#incoming").css('display', 'block');
	  done(true);
	}
	
	// for grins, display the incoming message progressively (one character at a time)
	var displayBits = function(span, message) {
		span = $('#'+span);
		$.each(message.split(''), function(i, letter){

			//we add 100*i ms delay to each letter 
			setTimeout(function(){

				//we add the letter to the container
				span.html(span.html() + letter);
	
			}, 10*i);
		});
	};

	// display system messages - meta data for the system
	that.displaySystemMessage = function(message) {
		// add the actual message text
		var id = "msg_" + new Date().getTime();
		var msg = "<li class='system'>";
		msg += "<span id='" + id + "'>&gt;&gt;&nbsp;" + message + "</span></li>";
		$("#messages").append(msg);       

		// scroll to the bottom of the list
		$("#messages").animate({
				scrollTop: $('#messages')[0].scrollHeight
		}, 500);
	};

	// convenience function to display messages - both incoming messages from remote
	// parties and local messages sent out.
	that.displayMessage = function (message, source, dest) {

		// new message item
		var msg, sd;

		// replace URLs with links
		var mtext = message.replace( /(http:\/\/[^\s]+)/gi , '<a target=\'_blank\' href="$1">$1</a>' );

		// destination is either an endpoint or "group"
		dest = dest ? dest : "Everyone";

		// make a copy of the source value that we can change
		var src = source;

		// if source == "Me" then this is an outgoing message
		if (source == "Me") {
			msg = "<li class='local'>";
			sd = "Me => " + dest;
		} else if (dest == "Everyone") {
			msg = "<li class='remote'>";
			sd = source + " => Everyone (Group Message)";
		} else {
			msg = "<li class='remote'>";
			sd = source + " => Me";
		}

		// if this message was from a different sender or to a different destination than the 
		// last message, add a source / destination identifier
		if (lastMsgSrc != sd) {
				// add the source
				msg += "<span class='tiny'>" + sd + "</span><br />";

				// update the last message source value
				lastMsgSrc = sd;
		}

		// add the actual message text
		var id = "msg_" + new Date().getTime();
		if ((source != "Me") && (mtext == message)) {
				// add the message blank
				msg += "<span id='" + id + "'></span></li>";
				$("#messages").append(msg);
		
				// do this old-school
				displayBits(id, message);
		} else {
				msg += "<span id='" + id + "'>" + mtext + "</span></li>";
				$("#messages").append(msg);       
		}


		// scroll to the bottom of the list
		$("#messages").animate({
				scrollTop: $('#messages')[0].scrollHeight
		}, 500);
	};
}
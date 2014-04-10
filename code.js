$(document).ready(function () {
	(function() {

		// here's the App ID value from the portal:
		var appid = "DD90A374-0C06-456F-9D4F-E8038E6523D2";

		// some vars used throughout the app
		var group = null;        // the group (pub/sub channel) used for messaging and presence
		var endpoint = null;     // the endpoint to which we are currently chatting
		var call = null;         // the current call (if any)
		var lastMsgSrc = null;   // source of the last message displayed
		var lastMsgDest = null;  // destination of the last message sent

		// tones played to indicate various events
		var ringTone = null;
		var joinTone = null;
		var leaveTone = null;
		var messageInTone = null;
		var messageOutTone = null;

		// create a Brightstream client object using the App ID
		var client = new brightstream.Client({
				"appId": appid
		});

		// listen for the 'connect' event and transition to the logged-in state
		// TODO: create two state classes to clean some of this up
		client.listen('connect', function () {
				// join the 'everyone' group so we can see who's online
				joinMainGroup();

				// update the screen
				$("#status").html("Connected As: " + $("#endpoint").val());
				$(".disconnected").attr("disabled", "disabled");
				$(".connected").removeAttr("disabled");
				$(".messaging").css("display", "block");
				$("#blackout").css("display", "block");
				$("#login").css("display", "none");
		
				// add the group messaging option to the contacts list
				$("#endpoints").append("<option value='group-message'>Everyone</option>");
				$("#textToSend").focus();
		
				displaySystemMessage("Connected.");
		});

		// listen for the 'disconnect' event and transition to the logged-out state
		client.listen('disconnect', function () {
				$("#status").html("Not Connected");
				$(".disconnected").removeAttr("disabled");
				$(".connected").attr("disabled", "disabled");
				$(".haveEndpoint").attr("disabled", "disabled");
				$(".messaging").css("display", "none");
				$("#blackout").css("display", "none");
				$("#login").css("display", "block");
				$("#endpoints").empty();
				$("#messages").empty();
		});

		// listen for incoming messages
		client.listen('message', function (evt) {
				messageInTone.play();
				displayMessage(evt.message.message, evt.message.endpointId);
		});

		// connect the client and add an additional listener for incoming calls
		var connect = function(token) {

			client.connect({
				authToken: token,

				// hook the 'call' event. - SHOULD ALSO BE AN EVENT ("call") NOT JUST A CALLBACK
				onCall: function (evt) {

					// ignore calls that we initiated
					if (evt.call.initiator === true) {
						return;
					}

					console.log("---- INCOMING CALL ----");
					console.dir(evt);

					ringTone.play();
					call = evt.call;

					// TODO: Launch "INCOMING" dialog here with timer to reject the call after N seconds.

					// answer the call with matching constraints
					// DAMN - THIS DOES NOT WORK. NO WAY TO FIND OUT IF AUDIO OR VIDEO!!!
					// TODO: Revise using the new signaling features we discussed on 4/4/14
					if (call.getRemoteStreams().length > 0) {  // Always returns 0 at this point!
						call.answer({
							constraints: {
								audio: true,
								video: true
							},
							onRemoteVideo: activateVideoCall,
							onHangup: terminateCall
						});
					} else {
						call.answer({
							constraints: {
								audio: true,
								video: true // SHOULD BE FALSE!!!!
							},
							onRemoteVideo: activateVideoCall, // SHOULD BE activateAudioCall!!!
							onHangup: terminateCall
						});
					}
					activateAudioCall();
				}
			});
		};

		// to connect, we will need an access token, so retrieve that using the 
		// AJAX capabilities of jQuery. Note that in a production app you will need
		// to get this from your own server, not directly from Brightstream!
		function getTokenAndConnect(endpoint) {
				$.ajax({
						type: 'POST',
						url: 'https://collective.brightstream.io/v1/tokens/',
						data: {
								"appId": appid,
								"endpointId": endpoint,
								"ttl": "60000"
						},
						success: function (resp) {
								// connect using the token we retrieved
								connect(resp.tokenId);
						},
						error: function (err) {
								alert(err.statusText);
						}
				});
		}

		// CONVENIENCE FUNCTIONS TO HANDLE VARIOUS EVENTS

		// join handler - invoked when client joins a group
		var handleJoin = function(evt) {
				console.log("-- ON-JOIN --");
				console.dir(evt);
				// don't add the endpoint if it's this client's endpoint (i.e. "myself")
				if (evt.endpoint.name != client.user.name) {
				
						// check for and prevent duplicates
						if ($("#endpoints option[value='" + evt.endpoint.id + "']").length === 0) {
						
								// create and add an option for the endpoint
								var opt = "<option value='" + evt.endpoint.id + "'>" + evt.endpoint.id + "</option>\n";
								$("#endpoints").append(opt);
						
								// display the change
								displaySystemMessage(evt.endpoint.id + " Connected");
						
								// play the "somebody joined" tone
								joinTone.play();
						
								// if this is the first endpoint in the list, select it
								if ($('#endpoints option').size() == 1) {
										 selectEndpoint();   
								}
						}
				}
		
		};

		var handleLeave = function(evt) {
				// remove from the drop-down list
				console.log("-- ON-LEAVE --");
		
				// remove the endpoint from the list
				$("#endpoints option[value='" + evt.endpoint.id + "']").remove();
		
				// display the chanage
				displaySystemMessage(evt.endpoint.id + " Disconnected");
		
				// play the "somebody left" tone
				leaveTone.play();
		
				// if that was the currently selected endpoint, disable the UI
				if (endpoint && (evt.endpoint.id == endpoint.id)) {
						endpoint = null;
						$(".haveEndpoint").attr("disabled", "disabled");
				}  
		};

		var handleGroupMessage = function(evt) {
				console.log("-- GROUP MESSAGE --");
				console.dir(evt);
				messageInTone.play();
				displayMessage(evt.message.message, evt.message.endpointId + " (To Everyone)");
		};

		// join the main 'everyone' group. this isn't used as a 'chat group' - just as
		// a presence indicator.
		var joinMainGroup = function () {

				client.join({
						"id": "everyone",
						"onJoin": handleJoin,
						"onLeave": handleLeave,
						"onMessage": handleGroupMessage,
						"onSuccess": function (grp) {
								// request all current endpoints
								grp.getEndpoints();
								// cache a link to the group
								group = grp;
						}        
				});
		};

		// select an endpoint - or perhaps more clearly, get the selected endpoint
		// if we have one, otherwise fall back to group messaging.
		var selectEndpoint = function () {
				// get the ID value from the text box
				var remoteId = $("#endpoints").val();

				// if the value is "group-message" then we're in group chat mode
				if (remoteId == "group-message") {
					// null out the endpoint
					endpoint = null;
			
					// lock the call controls - no group calls (yet)
					$(".haveEndpoint").attr("disabled", "disabled");
			
					// Note the selection change
					displaySystemMessage("Selected Contact: Everyone (Group Messaging)");
				
				} else {
		
					// create the endpoint ID
					endpoint = client.getEndpoint({
							"id": remoteId
					});

					// add to local storage for convenience
					localStorage.setItem('remote', remoteId);

					// display the change
					displaySystemMessage("Selected Contact: " + remoteId);
		
					// enable all the endpoint-related functions
					$(".haveEndpoint").removeAttr("disabled");
				}
				
				// focus to the text box
				$("#textToSend").focus();
		};

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
		var displaySystemMessage = function(message) {
				// add the actual message text
				var id = "msg_" + new Date().getTime();
				var msg = "<li class='system'>";
				//msg += "<span class='tiny'>System</span><br />";
				msg += "<span id='" + id + "'>&gt;&gt;&nbsp;" + message + "</span></li>";
				$("#messages").append(msg);       
		
				// scroll to the bottom of the list
				$("#messages").animate({
						scrollTop: $('#messages')[0].scrollHeight
				}, 1000);
		};

		// convenience function to display messages - both incoming messages from remote
		// parties and local messages sent out.
		var displayMessage = function (message, source) {

				// new message item
				var msg;
		
				// replace URLs with links
				var mtext = message.replace( /(http:\/\/[^\s]+)/gi , '<a target=\'_blank\' href="$1">$1</a>' );
		
				// destination is either an endpoint or "group"
				var dest = endpoint ? endpoint.id : "Everyone";
	
				// make a copy of the source value that we can change
				var src = source;
		
				// create a new list item to display the message
				if (source) {
						// incoming message - from "remote"
						msg = "<li class='remote'>";
						src = src + " => Me";
				} else {
						// outgoing message - from "me"
						msg = "<li class='local'>";
						src = "Me => " + dest;
				}
		
				// if this message was from a different sender than the last message, add
				// a source identifier
				if ((lastMsgSrc != src) || (lastMsgDest != dest)) {
						// add the source
						msg += "<span class='tiny'>" + src + "</span><br />";

						// update the last message source value
						lastMsgSrc = src;
						lastMsgDest = dest;
				}

				// add the actual message text
				var id = "msg_" + new Date().getTime();
				if ((source) && (mtext == message)) {
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
				}, 1000);
		};

		// send a message. called by button click and enter key
		var sendMessage = function () {

				// grab the text to send
				var messageText = $("#textToSend").val();

				// don't send blank messages
				if (messageText.trim().length === 0) return;

				// send it
				if (endpoint) {
						endpoint.sendMessage({
								"message": messageText
						});
				} else {
						group.sendMessage({
								"message": messageText
						});
				}
		
				// display it
				displayMessage(messageText);

				// play tone
				messageOutTone.play();
		
				// clear out the text box
				$("#textToSend").val("");
		};

		// add the video element and enable video controls
		var activateVideoCall = function (evt) {
				console.log("-- ON VIDEO ELEMENT --");
				console.dir(evt);
				console.dir(evt.target.getRemoteStreams());
				if ((evt) && (evt)) {
						var vo = $("#videoOverlay");
						vo.append(evt.element);
						vo.css("display", "block");
				}
		};

		// activate audio elements (mute) and call controls
		var activateAudioCall = function(evt) {
				$(".idle").attr("disabled", "disabled");
				$(".active").removeAttr("disabled");
		};

		// Go back to text mode, hiding video stuff
		var terminateCall = function (evt) {
				var vo = $("#videoOverlay");
				vo.empty();
				vo.css("display", "none");
				$(".idle").removeAttr("disabled");
				$(".active").attr("disabled", "disabled");
		};

		// HOOK VARIOUS BUTTONS ON THE UI

		// now connect when the user clicks the 'Connect' button
		$("#doLogin").click(function () {
				// get the endpoint ID
				var endpoint = $("#endpoint").val();

				// make sure that the endpoint is at least 3 characters
				if ((!endpoint) || (endpoint.length < 3)) return;
		
				// store it for future reference
				localStorage.setItem('username', endpoint);

				// try to get a token and connect to Brightstream
				getTokenAndConnect(endpoint);
		});

		// now connect when the user clicks the 'Connect' button
		$("#doLogout").click(function () {
				client.disconnect();
		});

		// Select an endpoint when the selection changes
		$("#endpoints").change(function () {
				selectEndpoint();
		});

		// Send messages automatically on <enter> in message box
		$("#textToSend").keypress(function (e) {
				if (e.which == 13) {
						sendMessage();
						return false;
				}
		});

		// Send a message when somebody clicks the button
		$("#sendMessage").click(sendMessage);

		// make an audio call
		$("#audioCall").click(function () {
				// if we have an endpoint
				if (endpoint) {
						// make an audio call
						call = endpoint.call({
								constraints: {
										audio: true,
										video: false
								},
								onHangup: terminateCall
								// THERE NEEDS TO BE A PROGRESS CALLBACK
						});
						activateAudioCall();
				}
		});

		// make a video call
		$("#videoCall").click(function () {
				// if we have an endpoint
				if (endpoint) {
						// make a video call
						call = endpoint.call({
								constraints: {
										audio: true,
										video: true
								},
								onRemoteVideo: activateVideoCall,
								onHangup: terminateCall
								// THERE NEEDS TO BE A MORE GRANULAR AND MORE CONCRETE CALLBACKS
						});
						activateAudioCall();
				}
		});

		// Hang up the call
		$("#endCall").click(function () {
				call.hangup();
		});

		// center up the communicator in the window
		$(window).resize(function(){				
				$('.main').css({
						position:'absolute',
						left: ($(window).width() - $('.main').outerWidth())/2,
						top: ($(window).height() - $('.main').outerHeight())/2
				});
		});	

		// Init Stuff
		$("#endpoint").val(localStorage.getItem("username"));
		ringTone = new Audio("audio/alert23.mp3");
		joinTone = new Audio("audio/communications_start_transmission.mp3");
		leaveTone = new Audio("audio/communications_end_transmission.mp3");
		messageInTone = new Audio("audio/computerbeep_11.mp3");
		messageOutTone = new Audio("audio/computerbeep_9.mp3");
		var startup = new Audio("audio/computer_activate.mp3");
		startup.play();

		// To initially run the function:
		$(window).resize();

		
	}());
});



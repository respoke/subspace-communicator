$(document).ready(function () {
	(function() {

		// here's the App ID value from the portal:
		var appid = "f25f63f5-7fee-4bed-b11f-c726004892b8";
		var identity = null;
		var token = null;
		
		// some vars used throughout the app
		var group = null;        // the group (pub/sub channel) used for messaging and presence
		var endpoint = null;     // the endpoint to which we are currently chatting
		var call = null;         // the current call (if any)

		// tones played to indicate various events
		var ringTone = null;
		var joinTone = null;
		var leaveTone = null;
		var messageInTone = null;
		var messageOutTone = null;

		// create a Respoke client object using the App ID
		var client = new respoke.Client({
				"appId": appid,
				"developmentMode": true
		});

		// all user interface state functions moved to another file/class
		var ui = new uiState();
		
		// listen for the 'connect' event and transition to the logged-in state
		client.listen('connect', function () {
				console.log("CONNECT EVENT");
				// join the 'everyone' group so we can see who's online
				joinMainGroup();
		
				// add the group messaging option to the contacts list
				$("#endpoints").append("<option value='group-message'>Everyone</option>");
				
				// display the messaging interface
				ui.connected();
		});

		client.listen('reconnect', function() {
			console.log("RECONNECT EVENT");
			ui.connected();
		});
		
		// listen for the 'disconnect' event and transition to the logged-out state
		client.listen('disconnect', function () {
		
				if (!token) {
					// if the token has been deleted, this is a logout
					ui.loggedOut();
				} else {				
					// if the token is still valid, this is a connectivity glitch
					ui.disconnected();
				}
		});

		// listen for incoming messages
		client.listen('message', function (evt) {
				if (evt.group !== undefined) return;
				messageInTone.play();
				ui.displayMessage(evt.message.message, evt.message.endpointId, "Me");
		});

    client.listen('call', function(evt) {
      // ignore calls that we start
      if (evt.call.caller === true) {
        return;
      }

      console.log("---- INCOMING CALL ----");
      console.dir(evt);

      // if we already have a call, reject the incoming call
      if (call) {
        evt.call.reject();
        return;
      }
      
      // play the incoming call ring tone
      ringTone.play();
        
      // display the incoming call UI and see what the user wants to do
      ui.incomingCall(evt.call, function(accept) {
        if (accept === false) {
          evt.call.reject();
          return;
        }
        
        // cache the call from the event as our master call object
        call = evt.call;
        
        // THIS SHOULD HAVE A WAY TO FIGURE OUT IF AUDIO OR VIDEO, BUT IT DOESN'T					
        call.listen('connect', function(evt) {
          console.log("CALL CONNECTED");
          ui.videoActive(evt.element);
        });
      
        call.listen('hangup', terminateCall);
        
        // TODO: Launch "INCOMING" dialog here with timer to reject the call after N seconds.
        ui.videoPending(call);
      
        call.answer({
          constraints: {
            audio: true,
            video: true
          }
        });
        
      });
    });
    
		// connect the client and add an additional listener for incoming calls
		var connect = function(endpoint) {

			client.connect({
				endpointId: endpoint,
				developmentMode: true,
				appId: appid
				
				// hook the 'call' event. - SHOULD ALSO BE AN EVENT ("call") NOT JUST A CALLBACK
//				onCall: function (evt) {
//				}
			});
		};

		// CONVENIENCE FUNCTIONS TO HANDLE VARIOUS EVENTS

		// join handler - invoked when client joins a group
		var handleJoin = function(evt) {
				console.log("-- ON-JOIN --");
				console.dir(evt);
				
				var endpoint = evt.connection.getEndpoint();
				
				// don't add the endpoint if it's this client's endpoint (i.e. "myself")
				if (endpoint.id != client.endpointId) {
						
						// check for and prevent duplicates
						if ($("#endpoints option[value='" + endpoint.id + "']").length === 0) {
						
								// create and add an option for the endpoint
								var opt = "<option value='" + endpoint.id + "'>" + endpoint.id + "</option>\n";
								$("#endpoints").append(opt);
						
								// display the change
								ui.displaySystemMessage(endpoint.id + " is online.");
						
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
		
				var ep = evt.connection.getEndpoint();
				
				// display the chanage
				ui.displaySystemMessage(ep.id + " disconnected.");
				
				// if the endpoint leaving is the currently selected endpoint, switch to group
				if (endpoint && (ep.id == endpoint.id)) {
					$("#endpoints").val("group-message");
					console.log("switching back to group");
					selectEndpoint();
				}
				
				// remove the endpoint from the list
				$("#endpoints option[value='" + ep.id + "']").remove();
						
				// play the "somebody left" tone
				leaveTone.play(); 
		};

		var handleGroupMessage = function(evt) {
				console.log("-- GROUP MESSAGE --");
				console.dir(evt);
				messageInTone.play();
				ui.displayMessage(evt.message.message, evt.message.endpointId);
		};

		// join the main 'everyone' group. this isn't used as a 'chat group' - just as
		// a presence indicator.
		var joinMainGroup = function () {
				console.log("JOINING GROUP 'everyone'");
				client.join({
						"id": "everyone",
						"onJoin": handleJoin,
						"onLeave": handleLeave,
						"onMessage": handleGroupMessage,
						"onSuccess": function (grp) {
								// request all current endpoints
								grp.getMembers().done(function getMembers(members) {
                  console.log('members: ', members);
                  for (var i = 0; i < members.length; i++) {
                    console.dir(members[i]);
                    var evt = {};
                    evt.connection = members[i];
                    handleJoin(evt);
                  }
                });

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
					ui.groupSelected();		
				
				} else {
		
					// create the endpoint ID
					endpoint = client.getEndpoint({
							"id": remoteId
					});

					// add to local storage for convenience
					localStorage.setItem('remote', remoteId);

					ui.endpointSelected(remoteId);
				}
				
				// focus to the text box
				$("#textToSend").focus();
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
				var dest = endpoint ? endpoint.id : null;
				ui.displayMessage(messageText, "Me", dest);

				// play tone
				messageOutTone.play();
		
				// clear out the text box
				$("#textToSend").val("");
		};

		// Called on hangup. Go back to text mode, hiding video stuff
		var terminateCall = function (evt) {
				ui.idle();
				
				// delete the call object
				call = null;
		};

		// HOOK VARIOUS BUTTONS ON THE UI

		// now connect when the user clicks the 'Connect' button
		$("#doLogin").click(function () {
			// get the endpoint ID
			var id = $("#endpoint").val();

			// 
			identity = id;
			
			// make sure that the endpoint is at least 3 characters
			if ((!identity) || (identity.length < 3)) return;
	
			// store it for future reference
			localStorage.setItem('username', identity);

			// try to get a token and connect to Respoke
			//if (!token) {
			connect(identity);
			//}
		});

		// now connect when the user clicks the 'Connect' button
		$("#doLogout").click(function () {
			token = null;
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


		// make an audio call
		$("#audioCall").click(function () {
			// if we have an endpoint
			if (endpoint) {
				// go into "outbound audio call" mode
				ui.audioPending();
				
				// make an audio call
				call = endpoint.startAudioCall({
						onHangup: terminateCall
						// THERE NEEDS TO BE A PROGRESS CALLBACK
				});
				
				// listen for the connected event.
				call.listen('connected', function(evt) {
					ui.audioActive();
				});
			}
		});

		// make a video call
		$("#videoCall").click(function () {
				// if we have an endpoint
				if (endpoint) {
					// go into pending video call mode
					ui.videoPending();
					
					// make a video call
					call = endpoint.startVideoCall({
							onHangup: terminateCall
							// THERE NEEDS TO BE A MORE GRANULAR AND MORE CONCRETE CALLBACKS
					});
					call.listen('connect', function(evt) {
						console.log("CALL CONNECTED");
						ui.videoActive(evt.element);
					});
				}
		});

		// Hang up the call
		$("#endCall").click(function () {
			if (call) {
				call.hangup();
			}
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
		startup.oncanplay = function() {
			startup.play();
		}

		// To initially run the function:
		$(window).resize();

		var updateOnlineStatus = function(evt) {
			console.log("Online Event");
			console.dir(evt);
			if (evt.type == "offline") {
				if (token) {
					ui.disconnected();
				}
			} else {
				if (client.isConnected() === true) {
					ui.connected();
				}
			}
		}
		
		window.addEventListener('online',  updateOnlineStatus);
		window.addEventListener('offline', updateOnlineStatus);
		
	}());
});



function theme_avatar(variables) {
  var mode = variables.mode ? variables.mode : 'default';
  var account = variables.account ? variables.account : Drupal.user;
  var options = {
    attributes: {
      class: 'avatar avatar-' + mode
    }
  };
  if (account.uid && account.picture && account.picture != '0') {
    options.path = variables.style_name ?
        image_style_url(variables.style_name, account.picture.uri) :
        drupalgap_image_path(account.picture.uri);
  }
  else if (drupalgap.settings.avatar && drupalgap.settings.avatar.defaultPicture) {
    options.path = drupalgap.settings.avatar.defaultPicture;
  }
  return options.path ? theme('image', options) : '';
}

/**
 * Implements hook_menu().
 */
function avatar_menu() {
  var items = {};
  items['avatar'] = {
    title: 'Edit picture',
    page_callback: 'avatar_page_default',
    pageshow: 'avatar_pageshow_default',
    access_callback: 'avatar_access_callback'
  };
  items['avatar/%'] = {
    title: 'Edit picture',
    page_callback: 'avatar_page',
    page_arguments: [1],
    access_callback: 'avatar_access_callback',
    access_arguments: [1]
  };
  return items;
}

function avatar_access_callback(uid) {
  uid = uid ? uid : Drupal.user.uid;
  if (!uid) { return false; }
  if (parseInt(uid) != Drupal.user.uid && !user_access('administer users')) { return false; }
  return true;
}

function avatar_page_container_id(uid) {
  return 'avatar-page-container-' + uid ? uid : Drupal.user.uid;
}

function avatar_page_default() {
  return avatar_page(Drupal.user.uid);
}
function avatar_pageshow_default() {
  return avatar_pageshow(Drupal.user.uid);
}

function avatar_page(uid) {
  var content = {};
  var attrs = {
    id: avatar_page_container_id(uid),
    class: 'avatar-page-container'
  };
  content['container'] = {
    markup: '<div ' + drupalgap_attributes(attrs) + '></div>'
  };
  return content;
}

function avatar_pageshow(uid) {
  if (!uid) {
    console.log('Only authenticated users can have avatars.');
    return;
  }
  _entity_local_storage_delete('user', uid);
  user_load(uid, {
    success: function(account) {
      $('#' + avatar_page_container_id(uid)).html(
          drupalgap_get_form('avatar_form', account)
      ).trigger('create');
    }
  });
}

function avatar_has_picture(account) {
  account = account ? account : Drupal.user;
  return account.picture && account.picture != '0';
}

function avatar_form(form, form_state, account) {

  //console.log(account);

  form.id += '_' + account.uid;
  var mode = 'submit';

  if (account.picture && account.picture != '0') {

    // User has a picture...
    mode = 'delete';
    form.suffix = theme('avatar', { account: account });

    form.elements['fid'] = {
      type: 'hidden',
      value: account.picture.fid,
      required: true
    };

    form.elements['submit'] = {
      type: 'submit',
      value: t('Delete')
    };

  }
  else {

    // User doesn't have a picture...

    form.elements.imageURI = {
      type: 'hidden',
      required: true
    };

    var items = [];
    items.push(
        l(t('Take a photo'), null, {
          attributes: {
            onclick: 'avatar_take_photo_onclick(this)',
            'data-theme': 'b',
            'data-icon': 'camera',
            uid: account.uid,
            class: 'avatar-take-photo'
          }
        })
    );
    items.push(
        l(t('Choose a photo'), null, {
          attributes: {
            onclick: 'avatar_choose_photo_onclick(this)',
            'data-theme': 'b',
            'data-icon': 'grid',
            uid: account.uid,
            class: 'avatar-choose-photo'
          }
        })
    );

    form.elements.controls = {
      markup: '<div data-role="navbar">' +
      theme('item_list', {
        items: items
      }) +
      '</div>'
    };

    // Placeholder for temp input addition
    if (drupalgap.settings.mode === 'web-app') {
      var new_input = 'placeholder';
      var input_html = '<input style="display:none" type="file" id="avatar_image_upload"';
      input_html += 'name="avatar_image_upload" onchange="avatar_web_load_preview();" accept=".jpg, .jpeg, .png">';
      form.elements[new_input] = {
        markup: input_html
      };
    }


    form.elements['submit'] = {
      type: 'submit',
      value: t('Save photo'),
      options: {
        attributes: {
          style: 'display: none;'
        }
      }
    };

    var suffix_attributes = {
      id: avatar_page_container_id(account.uid) + '-placeholder',
      class: 'avatar-placeholder-wrapper'
    };
    form.suffix = '<div ' + drupalgap_attributes(suffix_attributes) + '></div>';

  }

  form.elements.mode = {
    type: 'hidden',
    value: mode,
    required: true
  };
  form.elements.uid = {
    type: 'hidden',
    value: account.uid,
    required: true
  };

  return form;
}

function avatar_form_submit(form, form_state) {
  try {
    if (form_state.values.mode == 'delete') {
      drupalgap_confirm(t('Delete this picture?'), {
        confirmCallback: function(button) {
          if (button == 1) { // Ok
            file_delete(form_state.values.fid, {
              success: function(result) {
                user_save({
                  uid: form_state.values.uid,
                  picture: 0
                }, {
                  success: function() {
                    if (result[0]) {
                      avatar_pageshow(form_state.values.uid);
                      module_invoke_all('avatar_action', 'delete', form_state.values);
                    }
                  }
                });
              }
            });
          }
          else if (button == 2) { } // Cancel
        }
      });
      return;
    }

    // WEBAPP
    if (drupalgap.settings.mode === 'web-app') {

      // Pull the original file name from the image upload.
      var img_file_name = form_state.values.imageURI.split('filename=')[1].split(',')[0];
      avatarToDataUrl(form_state.values.imageURI, function(base64){
        avatarToDataUrlSuccess(base64, img_file_name, form, form_state);
      });
      return;
    }


    // Warn developer if camera quality is potentially high.
    if (drupalgap.settings.camera.quality > 50) {
      console.log('WARNING - avatar - a value over 50 for drupalgap.settings.camera.quality may cause upload issues');
    }

    avatar_show_submit_button(form_state.values.uid, true); // Hide the submit button.

    //console.log(form_state.values);
    var imageURI = form_state.values.imageURI;
    if (imageURI.indexOf('file://') == -1) { imageURI = 'file://' + imageURI; }

    window.resolveLocalFileSystemURL(imageURI, function success(fileEntry) {

      //console.log("got file: " + fileEntry.fullPath);
      //console.log(fileEntry);

      avatarToDataUrl(fileEntry.nativeURL, function(base64){
        avatarToDataUrlSuccess(base64, fileEntry.name, form, form_state);
      });

    }, function () {
      console.log('avatar had an accident, uh oh...', arguments);
    });
  }
  catch (error) { console.log('avatar_form_submit', error); }
}

function avatarToDataUrlSuccess(base64, filename, form, form_state) {
  var data = {
    "file":{
      "file": base64.substring( base64.indexOf(',') + 1 ), // Remove the e.g. "data:image/jpeg;base64," from the front of the string.
      "filename": filename,
      "filepath": "public://" + filename,
      uid: Drupal.user.uid
    }
  };

  // Upload it to Drupal to get the new file id...
  $('#edit-avatar-form-submit').text(t('Uploading...'));
  Drupal.services.call({
    method: 'POST',
    path: 'file.json',
    data: JSON.stringify(data),
    success: function(result) {

      var fid = result.fid;

      // Load the file from Drupal...
      file_load(fid, {
        success: function(file) {

          // Save their user account...
          var account = {
            uid: form_state.values.uid,
            status: 1,
            picture_upload: file
          };
          user_save(account, {
            success: function(result) {

              if (Drupal.user.uid == account.uid) { Drupal.user.picture = file; }

              module_invoke_all('avatar_action', 'save', form_state.values, file);

              // If a developer set a form action use it, otherwise just sit still.
              if (form.action) {
                var options = form.action_options ? form.action_options : null;
                if (options) { drupalgap_goto(form.action, options); }
                else { drupalgap_goto(form.action); }
              }

            }
          });

        }
      });

    }
  });
}


function avatar_replace_placeholder(uri, uid) {
  $('#avatar_form_' + uid + ' .form_suffix').html(
      theme('image', {
        path: uri
      })
  ).trigger('create');
  //attr('src', uri);
}

function avatar_show_submit_button(uid, hide) {
  var id = 'edit-avatar-form-' + uid + '-submit';
  if (hide) { $('#' + id).hide('slow'); }
  else { $('#' + id).show('slow'); }
}

function avatar_success(imageURI, button, mode) {
  var uid = $(button).attr('uid');
  avatar_replace_placeholder(imageURI, uid);
  avatar_show_submit_button(uid);
  $(button).removeClass('ui-btn-active');
  if (mode == 'take-photo') {
    $('a.avatar-take-photo').text(t('Take another photo'));
  }
  if (mode == 'choose-photo') {
    $('a.avatar-choose-photo').text(t('Choose another photo'));
  }
  $('#edit-avatar-form-' + uid + '-imageuri').val(imageURI);
}

function avatar_take_photo_onclick(button) {
  if (drupalgap.settings.mode == 'phonegap') {
    navigator.camera.getPicture(

        function(imageURI) {
          avatar_success(imageURI, button, 'choose-photo');
        },

        function(message) {
          if (message != 'Camera cancelled.') { drupalgap_alert(message); }
          $(button).removeClass('ui-btn-active');
        },

        {
          quality: drupalgap.settings.camera.quality,
          destinationType: Camera.DestinationType.FILE_URI,
          allowEdit: true,
          correctOrientation: true  //Corrects Android orientation quirks
        }
    );
  }
  else {
    var msg = 'Feature does not work in web app mode, yet...';
    if (Drupal.settings.debug) {
      drupalgap_toast(msg);
    }
    console.log(msg);
  }
}

function avatar_choose_photo_onclick(button) {
  if (drupalgap.settings.mode == 'phonegap') {
    navigator.camera.getPicture(

        function(imageURI) {
          avatar_success(imageURI, button, 'choose-photo');
        },

        function(message) {
          if (message != 'Selection cancelled.') { drupalgap_alert(message); }
          $(button).removeClass('ui-btn-active');
        },

        {
          quality: drupalgap.settings.camera.quality,
          destinationType: Camera.DestinationType.FILE_URI,
          sourceType: Camera.PictureSourceType.SAVEDPHOTOALBUM,
          mediaType: Camera.MediaType.PICTURE,
          correctOrientation: true  //Corrects Android orientation quirks
        }
    );
  }
  else {
    // Set the placeholder input.
    var input = document.querySelector('#avatar_image_upload');
    // Click the placeholder input.
    input.click();
  }
}

function avatar_web_load_preview() {
  // Set the placeholder input.
  var input = document.querySelector('#avatar_image_upload');
  // Grab the file from the file input element.
  var file = input.files[0];
  // Init a file reader.
  var reader = new FileReader();
  // Set and event listener for when the file is loaded from the input.
  reader.addEventListener("load", function () {
    // Load the preview.
    var button = document.getElementsByClassName('avatar-choose-photo');
    // Split the data for file name insert.
    data_start = reader.result.split(',')[0];
    data_end = reader.result.split(',')[1];
    // Add the file name to the data image.
    file = "filename=" + file.name + ",";
    data = data_start + ";" + file + data_end;
    // Preview successful.
    avatar_success(data, button, 'choose-photo');
  }, false);
  // Load the file chosen by the user and circle back to the "load" event listener.
  if (file) { reader.readAsDataURL(file); }
}


function avatarToDataUrl(url, callback){
  var xhr = new XMLHttpRequest();
  xhr.responseType = 'blob';
  xhr.onload = function() {
    var reader  = new FileReader();
    reader.onloadend = function () {
      callback(reader.result);
    };
    reader.readAsDataURL(xhr.response);
  };
  xhr.open('GET', url);
  xhr.send();
}
